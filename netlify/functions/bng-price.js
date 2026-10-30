
const { getSimulatedBngPrice } = require("./lib/bng-market");
function simulatedBngMarket() {
  // Deterministic demo history; intentionally not represented as exchange data.
  const start = Date.UTC(2025, 7, 1);
  const now = Date.now();
  const day = 86400000;
  const candles = [];
  let prev = 0.54;
  for (let t = start, i = 0; t <= now; t += day, i++) {
    const wave = 0.50 + 0.25*Math.sin(i*0.071) + 0.13*Math.sin(i*0.019+1.7) + 0.07*Math.sin(i*0.31);
    const close = Math.max(0.30, Math.min(1.00, wave));
    const open = Math.max(0.30, Math.min(1.00, prev));
    const high = Math.min(1.00, Math.max(open,close) + 0.012 + (Math.abs(Math.sin(i*1.91))*0.018));
    const low = Math.max(0.30, Math.min(open,close) - 0.012 - (Math.abs(Math.cos(i*1.37))*0.016));
    candles.push({t,o:Number(open.toFixed(4)),h:Number(high.toFixed(4)),l:Number(low.toFixed(4)),c:Number(close.toFixed(4)),v:Number((12000+Math.abs(Math.sin(i*0.23))*88000).toFixed(2))});
    prev = close;
  }
  return {priceUsd:getSimulatedBngPrice(now), candles};
}
const TOKENS = {
  BTCUSDT: { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", symbol: "BTC", label: "BTC/USDT", preferredQuote: "0x55d398326f99059ff775485246999027b3197955" },
  BNBUSDT: { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", symbol: "BNB", label: "BNB/USDT", preferredQuote: "0x55d398326f99059ff775485246999027b3197955" }
};
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const USDC = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";

function addr(x){ return String(x || "").toLowerCase(); }
function isUsdt(p){ return addr(p.baseToken?.address)===USDT || addr(p.quoteToken?.address)===USDT; }
function isWbnb(p){ return addr(p.baseToken?.address)===WBNB || addr(p.quoteToken?.address)===WBNB; }
function isUsdc(p){ return addr(p.baseToken?.address)===USDC || addr(p.quoteToken?.address)===USDC; }
function containsToken(p, token){ return addr(p.baseToken?.address)===token || addr(p.quoteToken?.address)===token; }

// Return the USD price of the requested token regardless of whether DexScreener
// represents it as the base or quote asset of the pair.
function tokenPriceUsd(pair, token){
  const base = addr(pair.baseToken?.address);
  const quote = addr(pair.quoteToken?.address);
  const pUsd = Number(pair.priceUsd);
  const pNative = Number(pair.priceNative);
  if(!Number.isFinite(pUsd) || pUsd <= 0) return null;
  if(base === token) return pUsd;
  if(quote === token && Number.isFinite(pNative) && pNative > 0) return pUsd / pNative;
  return null;
}

exports.handler = async function(event) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "access-control-allow-origin": "*"
  };

  try {
    const raw = String(event?.queryStringParameters?.pair || "BNGUSDT").toUpperCase().replace(/[^A-Z]/g, "");
    const supportedInternalPairs = ["BNGUSDT", "BNGBNB"];
    const key = TOKENS[raw] || supportedInternalPairs.includes(raw) ? raw : "BNGUSDT";

    if (key === "BNGUSDT" || key === "BNGBNB") {
      const sim = simulatedBngMarket();
      const latest = sim.candles[sim.candles.length - 1];
      const bnbUsd = Number(process.env.BNB_USD_PRICE || 600);
      return { statusCode:200, headers, body:JSON.stringify({
        ok:true, simulated:true, priceType:"SIMULATED_DEMO", ledgerOnly:true,
        notice:"Simulated BNG reference price; not a verified exchange quote or guaranteed redemption value.",
        pairKey:key, requestedPair:key === "BNGBNB" ? "BNG/BNB" : "BNG/USDT", priceUsd:sim.priceUsd,
        priceNative:key==="BNGBNB" ? Number((sim.priceUsd / bnbUsd).toFixed(8)) : sim.priceUsd,
        priceQuote:key==="BNGBNB" ? Number((sim.priceUsd / bnbUsd).toFixed(8)) : sim.priceUsd,
        quotePriceUsd:key==="BNGBNB" ? bnbUsd : 1, dexId:"BANG-BNG-SIMULATION",
        pairAddress:null, pairUrl:null, pairLabel:key==="BNGBNB"?"BNG/BNB • SIMULATED":"BNG/USDT • SIMULATED",
        marketPair:key==="BNGBNB"?"BNG/BNB":"BNG/USDT", fallbackUsed:false,
        liquidityUsd:0, volume24h:latest.v, priceChange24h: sim.candles.length>1 ? Number(((latest.c/sim.candles[sim.candles.length-2].c-1)*100).toFixed(2)) : 0,
        updatedAt:Date.now(), historyStart:"2025-08-01T00:00:00.000Z", candles:sim.candles
      })};
    }

    const cfg = TOKENS[key];
    const token = cfg.address.toLowerCase();
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, {
      headers: { accept: "application/json" }
    });
    if(!r.ok) throw new Error(`DexScreener HTTP ${r.status}`);
    const data = await r.json();

    let pairs = (data.pairs || [])
      .filter(p => p && p.chainId === "bsc" && p.baseToken && p.quoteToken)
      .filter(p => containsToken(p, token))
      .map(p => ({ p, priceUsd: tokenPriceUsd(p, token) }))
      .filter(x => Number.isFinite(x.priceUsd) && x.priceUsd > 0);

    // For BNG specifically, prefer BNG/USDT. If unavailable, automatically
    // fall back to the deepest BNG/WBNB market, then USDC, then any BSC pair.
    if(key === "BNGUSDT" || key === "BNGBNB") {
      const rank = x => {
        const p=x.p;
        if(key === "BNGBNB") {
          if(isWbnb(p)) return 0;
          if(isUsdt(p)) return 1;
        } else {
          if(isUsdt(p)) return 0;
          if(isWbnb(p)) return 1;
        }
        if(isUsdc(p)) return 2;
        return 99;
      };
      pairs.sort((a,b) => {
        const ar=rank(a), br=rank(b);
        if(ar!==br) return ar-br;
        return Number(b.p.liquidity?.usd||0)-Number(a.p.liquidity?.usd||0);
      });
    } else {
      pairs.sort((a,b) => {
        const aq=addr(a.p.quoteToken?.address), bq=addr(b.p.quoteToken?.address);
        const rank=q => q===USDT?0:(q===WBNB?1:(q===USDC?2:99));
        const ar=rank(aq), br=rank(bq);
        if(ar!==br) return ar-br;
        return Number(b.p.liquidity?.usd||0)-Number(a.p.liquidity?.usd||0);
      });
    }

    const selected = pairs[0];
    if(!selected) {
      return { statusCode:404, headers, body:JSON.stringify({
        ok:false,
        message:`No verified ${cfg.label} market was found.`
      })};
    }

    const pair = selected.p;
    const actualPriceUsd = selected.priceUsd;
    const baseIsToken = addr(pair.baseToken?.address)===token;
    const priceNative = Number(pair.priceNative||0);
    const quotePriceUsd = baseIsToken && priceNative>0 ? actualPriceUsd/priceNative : (!baseIsToken ? actualPriceUsd : null);
    const actualPriceQuote = key === "BNGBNB" && priceNative>0 ? (baseIsToken ? priceNative : 1/priceNative) : actualPriceUsd;
    let candles=[];
    try {
      const gt=await fetch(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${pair.pairAddress}/ohlcv/hour?aggregate=1&limit=240&currency=usd`);
      if(gt.ok){
        const gd=await gt.json();
        const rows=gd?.data?.attributes?.ohlcv_list||[];
        candles=rows.reverse().map(r=>({t:Number(r[0])*1000,o:Number(r[1]),h:Number(r[2]),l:Number(r[3]),c:Number(r[4]),v:Number(r[5]||0)})).filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite));
        // If BNG is the quote side, GeckoTerminal OHLC is for the pair base.
        // Do not expose it as BNG candles unless BNG is the base token.
        if(addr(pair.baseToken?.address)!==token) candles=[];
      }
    } catch(_) {}

    const marketPair=`${pair.baseToken.symbol}/${pair.quoteToken.symbol}`;
    const fallbackUsed=false;
    return { statusCode:200, headers, body:JSON.stringify({
      ok:true,
      pairKey:key,
      requestedPair:cfg.label,
      priceUsd:Number(actualPriceUsd),
      priceNative:Number(pair.priceNative||0),
      priceQuote:Number(actualPriceQuote),
      quotePriceUsd:Number(quotePriceUsd||0),
      dexId:pair.dexId,
      pairAddress:pair.pairAddress,
      pairUrl:pair.url,
      pairLabel:cfg.label,
      marketPair,
      fallbackUsed,
      liquidityUsd:Number(pair.liquidity?.usd||0),
      volume24h:Number(pair.volume?.h24||0),
      priceChange24h:Number(pair.priceChange?.h24||0),
      baseToken:pair.baseToken,
      quoteToken:pair.quoteToken,
      updatedAt:Date.now(),
      candles
    })};
  } catch(e) {
    return { statusCode:502, headers, body:JSON.stringify({ok:false,message:"Live market provider unavailable."})};
  }
};
