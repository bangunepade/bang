
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
const app = getApps().find(a => a.name === 'bang-bng-site-auth') || initializeApp(firebaseConfig, 'bang-bng-site-auth');
const auth = getAuth(app);
await setPersistence(auth,browserLocalPersistence).catch(()=>{});
const el = id => document.getElementById(id);
let currentUser = null;
const round8 = n => Math.round((Number(n) + Number.EPSILON) * 1e8) / 1e8;
const fmt = n => Number.isFinite(n) ? n.toLocaleString(undefined,{maximumFractionDigits:8}) : '—';
function quote(){
 const amount=Number(el('internalAmount').value), from=el('internalFrom').value, to=el('internalTo').value;
 el('iGross').textContent=Number.isFinite(amount)&&amount>0?fmt(amount)+' '+from:'—';
 el('iFee').textContent=Number.isFinite(amount)&&amount>0?(from==='BNG'?fmt(round8(amount*.005))+' BNG':'Rate calculated securely on server'):'—';
 el('iNet').textContent='Minimum swap value: 2 BNG-equivalent';
 el('iOut').textContent='Rate required';
}
['internalAmount','internalFrom','internalTo'].forEach(id=>el(id).addEventListener('input',quote));
let requestBusy=false;
el('internalSwap').addEventListener('click',async()=>{
 if(requestBusy)return;
 const from=el('internalFrom').value,to=el('internalTo').value,amount=Number(el('internalAmount').value);
 if(!currentUser){el('internalStatus').textContent='Please sign in to your BANG BNG account first.';return;}
 if(from===to){el('internalStatus').textContent='Choose two different assets.';return;}
 if(!Number.isFinite(amount)||amount<=0){el('internalStatus').textContent='Enter a valid positive amount.';return;}
 if(from==='BNG'&&amount<2){el('internalStatus').textContent='Minimum swap size is 2 BNG.';return;}
 const swapId=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(16)+'-'+Math.random().toString(16).slice(2));
 if(!confirm('Swap '+amount+' '+from+' to '+to+' using internal ledger balances? A 0.50% fee in BNG will be deducted separately. Minimum swap value is 2 BNG-equivalent. A limited transaction receipt will be publicly verifiable in the Explorer. This is not an on-chain transaction.'))return;
 requestBusy=true;el('internalSwap').disabled=true;el('internalStatus').textContent='Checking rates, balance and treasury reserve…';
 try{
  const token=await currentUser.getIdToken();
  const response=await fetch('/api/wallet/swap',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({from,to,amount,swapId})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Internal swap failed.');
  el('internalStatus').textContent='Swap completed in the internal ledger. Permanent transaction ID: '+data.transactionId+'. No blockchain transaction was sent.';
  el('receiptTx').textContent=data.transactionId||'—';el('receiptPair').textContent=fmt(data.amountIn)+' '+from+' → '+fmt(data.amountOut)+' '+to;el('receiptFee').textContent=fmt(data.gasFeeBng??data.feeAmount)+' BNG';el('receiptStatus').textContent='COMPLETED · INTERNAL';el('receiptTime').textContent=new Date(data.createdAtMs||Date.now()).toLocaleString(undefined,{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'});el('receiptVerify').href='/explorer.html?verify='+encodeURIComponent(data.transactionId||'');el('swapReceipt').hidden=false;
  el('internalAmount').value='';quote();
 }catch(e){el('internalStatus').textContent=e.message||'Internal swap failed.';}
 finally{requestBusy=false;el('internalSwap').disabled=false;}
});
onAuthStateChanged(auth,user=>{currentUser=user;if(user)el('internalStatus').textContent='Signed in. Internal swaps require configured server rates and sufficient treasury reserves.';else el('internalStatus').textContent='Sign in to your BANG BNG account to swap internal balances.';});
const marketIds={BTC:'bitcoin',BCH:'bitcoin-cash',ADA:'cardano',SOL:'solana',ETH:'ethereum',BNB:'binancecoin',DOGE:'dogecoin',USDT:'tether',XRP:'ripple'};
let marketPrices={};
async function refreshSwapPrices(){
 try{
  const r=await fetch('/.netlify/functions/crypto-market?prices=1',{cache:'no-store'}); if(!r.ok) throw new Error('Market feed unavailable');
  const d=await r.json(); marketPrices=d.prices||{};
  let bngUsd=null;
  try { const br=await fetch('/.netlify/functions/bng-price',{cache:'no-store'}); if(br.ok){const bd=await br.json(); bngUsd=Number(bd.priceUsd??bd.usd??bd.price??bd.referencePrice);}} catch(_){}
  const label=a=>{if(a==='BNG')return Number.isFinite(bngUsd)&&bngUsd>0?'BNG internal reference: $'+bngUsd.toFixed(6)+' (not an exchange quote)':'BNG internal reference price unavailable';const id=marketIds[a],v=marketPrices[id]?.usd;return Number.isFinite(Number(v))?'Live '+a+' market price: $'+Number(v).toLocaleString(undefined,{maximumFractionDigits:8}):a+' market price unavailable';};
  el('fromPrice').textContent=label(el('internalFrom').value);el('toPrice').textContent=label(el('internalTo').value);
 }catch(_){el('fromPrice').textContent='Market prices temporarily unavailable; estimates are not guaranteed.';el('toPrice').textContent='Market prices temporarily unavailable; estimates are not guaranteed.';}
}
function updateSelectedPrices(){const label=a=>{if(a==='BNG')return 'BNG internal reference price (not an exchange quote)';const id=marketIds[a],v=marketPrices[id]?.usd;return Number.isFinite(Number(v))?'Live '+a+' price: $'+Number(v).toLocaleString(undefined,{maximumFractionDigits:8}):a+' price unavailable';};el('fromPrice').textContent=label(el('internalFrom').value);el('toPrice').textContent=label(el('internalTo').value);}
['internalFrom','internalTo'].forEach(id=>el(id).addEventListener('change',updateSelectedPrices));
refreshSwapPrices();setInterval(refreshSwapPrices,60000);
quote();
