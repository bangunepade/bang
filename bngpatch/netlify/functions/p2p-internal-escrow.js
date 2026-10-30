const crypto = require('crypto');
const { getAdmin, requireUser, json } = require('./lib/firebase-admin');
const { ensureAllAssetAddresses } = require('./lib/wallet-addresses');
const { getSimulatedBngPrice } = require('./lib/bng-market');
const COLLECTION = 'internalP2PEscrows';
const MAX_AMOUNT = 1e12;
const SUPPORTED_ASSETS = ['BNG','BTC','BNB','USDT','ADA','BCH','ETH','SOL','DOGE','XRP'];
const assetKey = asset => String(asset || 'BNG').toLowerCase();
const P2P_FEE_RATE = 0.00878690; // Existing 0.878690% P2P fee; charged separately in BNG.

const OFFER_EXPIRATIONS = {
  '20m': 20 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  'never': null
};
function expiryTime(x) {
  if (x.expirationMode === 'never') return null;
  const direct = Number(x.expiresAt || 0);
  if (direct > 0) return direct;
  const created = x.createdAt && typeof x.createdAt.toMillis === 'function' ? x.createdAt.toMillis() : 0;
  return created > 0 ? created + OFFER_EXPIRATIONS['20m'] : Date.now() + OFFER_EXPIRATIONS['20m'];
}
async function expireOpenOffers(db, admin) {
  const snap = await db.collection(COLLECTION).where('status','==','open').limit(200).get();
  const nowMs = Date.now(), serverNow = admin.firestore.FieldValue.serverTimestamp();
  for (const doc of snap.docs) {
    const ref = doc.ref;
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (!current.exists) return;
      const x = current.data();
      if (x.status !== 'open') return;
      const expires = expiryTime(x);
      if (expires === null) return;
      if (expires > nowMs) { if (!x.expiresAt) tx.update(ref, { expiresAt: expires }); return; }
      const side = x.side || 'sell', asset = String(x.asset || 'BNG').toUpperCase();
      if (side === 'sell' && x.sellerUid && SUPPORTED_ASSETS.includes(asset)) {
        const wref = db.collection('walletBalances').doc(x.sellerUid);
        const ws = await tx.get(wref);
        const wallet = ws.exists ? ws.data() : {};
        const key = assetKey(asset), balance = Math.max(0, Number(wallet[key] || 0));
        const amount = Math.max(0, Number(x.amount || 0));
        tx.set(wref, { uid: x.sellerUid, [key]: Math.round((balance + amount) * 1e8) / 1e8, updatedAt: serverNow }, { merge: true });
        tx.create(db.collection('walletTransactions').doc(doc.id + '_expiry_unlock'), {
          uid: x.sellerUid, transactionId: x.transactionId || ('BNG-TX-' + doc.id.toUpperCase()),
          type: 'p2p_escrow_expiry_unlock', escrowId: doc.id, asset, amount,
          status: 'returned_internal_escrow', createdAt: serverNow, ledgerOnly: true
        });
      }
      tx.update(ref, { status: 'expired', expiredAt: serverNow, updatedAt: serverNow, expiresAt: expires });
    });
  }
}
const round8 = n => Math.round((Number(n) + Number.EPSILON) * 1e8) / 1e8;
const MARKET_IDS = { BTC:'bitcoin', BNB:'binancecoin', USDT:'tether', ADA:'cardano', BCH:'bitcoin-cash', ETH:'ethereum', SOL:'solana', DOGE:'dogecoin', XRP:'ripple' };
let cachedBngRates = null, cachedBngRatesAt = 0;
async function getBngRates() {
  if (cachedBngRates && Date.now() - cachedBngRatesAt < 60000) return cachedBngRates;
  const bngUsd = Number(getSimulatedBngPrice());
  if (!Number.isFinite(bngUsd) || bngUsd <= 0) err('BNG reference price is unavailable. P2P offer creation is paused safely.', 503);
  const ids = [...new Set(Object.values(MARKET_IDS))].join(',');
  let response;
  try { response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(ids) + '&vs_currencies=usd', { headers: { accept: 'application/json' } }); }
  catch (_) { err('Token reference prices are temporarily unavailable. Please retry later.', 503); }
  if (!response.ok) {
    cachedBngRates = { BNG: 1 }; cachedBngRatesAt = Date.now(); return cachedBngRates;
  }
  const data = await response.json();
  const rates = { BNG: 1 };
  for (const [asset, id] of Object.entries(MARKET_IDS)) {
    const usd = Number(data?.[id]?.usd);
    if (Number.isFinite(usd) && usd > 0) rates[asset] = usd / bngUsd; // BNG-equivalent value of one unit of this asset.
  }
  cachedBngRates = rates; cachedBngRatesAt = Date.now(); return rates;
}
function cleanAmount(v) { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT && round8(n) === n ? n : null; }
function err(message, statusCode=400) { const e = new Error(message); e.statusCode = statusCode; throw e; }
exports.handler = async (event) => {
  try {
    // Public marketplace: GET without credentials exposes only open offer details needed for browsing.
    if (event.httpMethod === 'GET' && (!event.queryStringParameters || event.queryStringParameters.view !== 'mine')) {
      const admin = getAdmin();
      const db = admin.firestore();
      await expireOpenOffers(db, admin);
      const openSnap = await db.collection(COLLECTION).where('status','==','open').limit(50).get();
      const offers = openSnap.docs.map(d => { const x=d.data(); return {id:d.id,transactionId:String(x.transactionId||('BNG-TX-'+d.id.toUpperCase())),offerTitle:String(x.offerTitle||((x.side==='buy'?'Buy ':'Sell ')+(x.asset||'BNG'))),side:String(x.side||'sell'),asset:String(x.asset||'BNG'),amount:Number(x.amount||0),status:x.status,sellerAddress:'Internal account',paymentMethod:x.paymentMethod||'External payment',country:x.country||'',pricePerBng:Number(x.pricePerBng||x.pricePerAsset||0),pricePerAsset:Number(x.pricePerAsset||x.pricePerBng||0),feeAsset:String(x.feeAsset||'BNG'),currency:x.currency||'USD',terms:x.terms||'',createdAt:x.createdAt?.toDate?.()?.toISOString?.()||null,expiresAt:expiryTime(x),expirationMode:x.expirationMode||'20m',renewedAt:x.renewedAt?.toDate?.()?.toISOString?.()||null}; });
      return json(200,{offers:offers.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')),ledgerOnly:true,public:true});
    }
    const { admin, decoded } = await requireUser(event);
    const db = admin.firestore();
    // Ensure every signed-in account has all supported internal asset addresses.
    if (event.httpMethod === 'GET') await ensureAllAssetAddresses(admin, decoded.uid);
    if (event.httpMethod === 'GET') {
      await expireOpenOffers(db, admin);
      const [openSnap, sellerSnap, buyerSnap, walletSnap] = await Promise.all([
        db.collection(COLLECTION).where('status','==','open').limit(50).get(),
        db.collection(COLLECTION).where('sellerUid','==',decoded.uid).limit(50).get(),
        db.collection(COLLECTION).where('buyerUid','==',decoded.uid).limit(50).get(),
        db.collection('walletBalances').doc(decoded.uid).get()
      ]);
      const map = new Map();
      for (const snap of [openSnap,sellerSnap,buyerSnap]) for (const d of snap.docs) {
        const x=d.data(); map.set(d.id,{id:d.id,transactionId:String(x.transactionId||('BNG-TX-'+d.id.toUpperCase())),offerTitle:String(x.offerTitle||((x.side==='buy'?'Buy ':'Sell ')+(x.asset||'BNG'))),side:String(x.side||'sell'),asset:String(x.asset||'BNG'),amount:Number(x.amount||0),status:x.status,
          sellerAddress:x.sellerAddress||(String(x.asset||'BNG')+' internal account'), buyerAddress:x.buyerAddress||'',
          escrowFunded:x.escrowFunded===true || ((x.side||'sell')==='sell' && ['open','accepted','paid','disputed','released'].includes(x.status)),escrowFundedAt:x.escrowFundedAt?.toDate?.()?.toISOString?.()||null,escrowFundedByRole:x.escrowFundedByRole||((x.side||'sell')==='sell'?'seller':''),escrowFundedAsset:String(x.escrowFundedAsset||x.asset||'BNG'),escrowFundedAmount:Number(x.escrowFundedAmount??(((x.side||'sell')==='sell')?x.amount:0)),
          sellerUid:x.sellerUid,buyerUid:x.buyerUid||'',sellerEmail:x.sellerUid===decoded.uid?String(x.sellerEmail||''):'',buyerEmail:x.buyerUid===decoded.uid||x.sellerUid===decoded.uid?String(x.buyerEmail||''):'',paymentMethod:x.paymentMethod||'External payment',country:x.country||'',
          paymentReference:x.paymentReference||'',pricePerBng:Number(x.pricePerBng||x.pricePerAsset||0),pricePerAsset:Number(x.pricePerAsset||x.pricePerBng||0),feeAsset:String(x.feeAsset||'BNG'),currency:x.currency||'USD',terms:x.terms||'',createdAt:x.createdAt?.toDate?.()?.toISOString?.()||null,expiresAt:expiryTime(x),expirationMode:x.expirationMode||'20m',renewedAt:x.renewedAt?.toDate?.()?.toISOString?.()||null,
          isSeller:x.sellerUid===decoded.uid,isBuyer:x.buyerUid===decoded.uid});
      }
      const privateOffers=[...map.values()];
      await Promise.all(privateOffers.filter(o=>o.status==='released'&&(o.isSeller||o.isBuyer)).map(async o=>{
        const [mine, ratings]=await Promise.all([db.collection('p2pRatings').doc(o.id+'_'+decoded.uid).get(),db.collection('p2pRatings').where('escrowId','==',o.id).get()]);
        o.ratedByMe=mine.exists; o.ratings=ratings.docs.map(d=>({score:Number(d.data().score||0),comment:String(d.data().comment||''),createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null}));
      }));
      const walletData=walletSnap.exists?walletSnap.data():{};
      const assetBalances=Object.fromEntries(SUPPORTED_ASSETS.map(asset=>[asset,Math.max(0,Number(walletData[assetKey(asset)]||0))]));
      let bngRates={BNG:1},minimumOfferAmounts={BNG:10};
      try {
        bngRates=await getBngRates();
        minimumOfferAmounts=Object.fromEntries(SUPPORTED_ASSETS.filter(asset=>Number(bngRates[asset])>0).map(asset=>[asset,round8(10/bngRates[asset])]));
      } catch (_) { /* Listing and history remain available if market references are temporarily down. */ }
      const bngBalance=assetBalances.BNG;
      return json(200,{offers:privateOffers.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')),bngBalance,assetBalances,bngRates,minimumOfferAmounts,minimumOfferBalance:10,p2pFeeRate:P2P_FEE_RATE,ledgerOnly:true});
    }
    if (event.httpMethod !== 'POST') return json(405,{error:'Method not allowed.'});
    let body={}; try { body=JSON.parse(event.body||'{}'); } catch (_) { return json(400,{error:'Invalid request body.'}); }
    const action=String(body.action||''); const id=String(body.escrowId||'');
    const now=admin.firestore.FieldValue.serverTimestamp();
    const escrowRef=id ? db.collection(COLLECTION).doc(id) : null;
    const walletRef=uid=>db.collection('walletBalances').doc(uid);
    if (action==='chat-list' || action==='chat-send') {
      if (!id || !/^[a-f0-9]{16,64}$/i.test(id)) err('Invalid trade ID.');
      const ref=db.collection(COLLECTION).doc(id); const snap=await ref.get();
      if(!snap.exists) err('Trade not found.',404);
      const trade=snap.data();
      if(![trade.sellerUid,trade.buyerUid].includes(decoded.uid) || !trade.buyerUid) err('Only this trade’s buyer and seller can use its chat.',403);
      if(!['accepted','paid','disputed','released','refunded'].includes(trade.status)) err('Chat opens after an offer is accepted.',409);
      const messages=ref.collection('messages');
      if(action==='chat-list') {
        const ms=await messages.orderBy('createdAt','asc').limit(100).get();
        return json(200,{messages:ms.docs.map(d=>{const m=d.data();return {id:d.id,uid:m.uid,displayName:m.displayName,text:m.text,createdAt:m.createdAt?.toDate?.()?.toISOString?.()||null}})});
      }
      const text=String(body.text||'').trim();
      if(!text || text.length>1000) err('Message must be between 1 and 1000 characters.');
      const profileSnap=await db.collection('users').doc(decoded.uid).get();
      const displayName=String(profileSnap.exists?(profileSnap.data().displayName||profileSnap.data().username||'P2P member'):'P2P member').slice(0,80);
      const msgRef=messages.doc();
      await msgRef.set({uid:decoded.uid,displayName,text,createdAt:now});
      await ref.update({lastChatAt:now,lastChatBy:decoded.uid});
      return json(200,{ok:true,message:'Message sent.'});
    }
    if (action==='create') {
      const side=String(body.side||'sell').toLowerCase(); if(!['buy','sell'].includes(side)) err('Choose buy or sell offer.');
      const expirationMode=String(body.expirationMode||'20m'); if(!Object.prototype.hasOwnProperty.call(OFFER_EXPIRATIONS,expirationMode)) err('Choose a supported offer expiration.');
      const offerExpiresAt=OFFER_EXPIRATIONS[expirationMode]===null?null:Date.now()+OFFER_EXPIRATIONS[expirationMode];
      const asset=String(body.asset||'BNG').trim().toUpperCase(); if(!SUPPORTED_ASSETS.includes(asset)) err('Choose a supported asset: '+SUPPORTED_ASSETS.join(', ')+'.');
      const amount=cleanAmount(body.amount); if(!amount) err('Enter a valid '+asset+' amount with up to 8 decimal places.');
      const bngRates=asset==='BNG'?{BNG:1}:await getBngRates(); const bngPerAsset=Number(bngRates[asset]);
      if(!Number.isFinite(bngPerAsset)||bngPerAsset<=0) err('No valid reference rate is available for '+asset+'. P2P offer creation is paused safely.',503);
      const minimumAmount=10/bngPerAsset;
      if(amount*bngPerAsset < 10-1e-8) err('Minimum P2P offer value is 10 BNG-equivalent. For '+asset+', enter at least '+round8(minimumAmount)+' '+asset+'.');
      const offerTitle=String(body.offerTitle||((side==='buy'?'Buy ':'Sell ')+asset)).trim().slice(0,80)||('Sell '+asset);
      const paymentMethod=String(body.paymentMethod||'Other').split(',').map(v=>v.trim()).filter(Boolean).slice(0,8).join(', ').slice(0,240);
      const allowed=['M-Pesa','Bank transfer','Other','SEPA transfer','SWIFT / international wire','Debit / credit card','MTN Mobile Money','Airtel Money','Orange Money','bKash','GCash','UPI','PIX','PayPal','Wise','Payoneer','Cash App','Venmo','Zelle','Revolut','Apple Pay','Google Pay','Cash in person','Cash deposit','Crypto transfer','Interac e-Transfer','Easypaisa','DuitNow','PayNow','PromptPay','ACH','Faster Payments','BACS','CHAPS','SEPA Instant','iDEAL','BLIK','Przelewy24','Bancontact','EPS','Bizum','MB WAY','Multibanco','Swish','Vipps','MobilePay','TWINT','Trustly','Pay by Bank','PayID','BPAY','New Payments Platform (NPP)','FPS Hong Kong','SPEI','PSE','SINPE Móvil','Khipu','Servipag','Faster Payments (UK)','IMPS','NEFT','RTGS','Net banking','QRIS','VietQR','FAST Singapore','InstaPay Philippines','PESONet','QR Ph','FPX','BAKONG','PayNow QR','PromptPay QR','Visa','Mastercard','American Express','Discover','Diners Club','UnionPay','JCB','Maestro','RuPay','Verve','mada','Meeza','Troy','Elo','Cartes Bancaires','Interac Debit','Mir','Alipay','WeChat Pay','DANA','OVO','ShopeePay','LinkAja','GoPay Indonesia','GrabPay','TrueMoney','MoMo Vietnam','ZaloPay','Paytm','PhonePe','Google Pay India','PayPay Japan','Rakuten Pay','LINE Pay','KakaoPay','Naver Pay','Maya','Toss Pay','Mercado Pago','PicPay','Nequi','DaviPlata','Yape','Plin','RappiPay','Mach','Webpay / Redcompra','PagoEfectivo','Boleto Bancário','OXXO Pay','Yappy','DeUna','Fawry','InstaPay Egypt','Vodafone Cash','Orange Cash','Etisalat Cash','STC Pay','Careem Pay','urpay','BenefitPay','KNET','CliQ','Aani','Bankily','EVC Plus','eDahab','Zaad','EcoCash','InnBucks','OneMoney','telebirr','CBE Birr','Wave','Moov Money','Free Money','Tigo Pesa','Chipper Cash','Paga','OPay','PalmPay','PayShap','Ozow','SnapScan','Mukuru','TMoney','Flooz','AirtelTigo Money','MTN MoMo Ghana','Orange Money Africa','M-Pesa Tanzania','M-Pesa Ethiopia','Airtel Money Africa','Tigo Cash','Skrill','Neteller','Satispay','PostFinance Pay','Payz','Multicaixa Express','Yape Perú','Plin Perú','Boleto cash payment','OXXO cash payment','Efecty','Rapipago','Pago Fácil','Cash-in network','Bank branch deposit','Post office payment','Cash on delivery'];
      if(!paymentMethod || paymentMethod.split(',').map(v=>v.trim()).some(v=>!allowed.includes(v))) err('Choose supported payment methods.');
      const pricePerBng=Number(body.pricePerAsset ?? body.pricePerBng);
      if(!Number.isFinite(pricePerBng)||pricePerBng<=0||pricePerBng>1e12||Math.round(pricePerBng*1e6)/1e6!==pricePerBng) err('Enter a valid price per '+asset+' with up to 6 decimal places.');
      const currency=String(body.currency||'USD').trim().toUpperCase();
      if(!/^[A-Z]{3}$/.test(currency) || !['USD','EUR','GBP','KES','KPW','MVR','SYP','VES','BYN','MRU','SLE','ZWL','ISK','UZS','CAD','AUD','NZD','INR','PKR','BDT','NGN','GHS','ZAR','TZS','UGX','ETB','RWF','XOF','XAF','EGP','MAD','DZD','TND','BRL','MXN','ARS','COP','CLP','PEN','JPY','CNY','KRW','SGD','MYR','IDR','PHP','THB','VND','TRY','SAR','AED','QAR','ILS','CHF','NOK','SEK','DKK','PLN','CZK','HUF','RON','BGN','RSD','UAH','RUB','KZT','LKR','NPR','MMK','KHR','LAK','MNT','FJD','PGK','XPF','BWP','NAD','MUR','MWK','MZN','ZMW','BIF','CDF','SOS','SDG','SSP','GMD','GNF','LRD','SLE','LSL','SZL','AOA','MGA','SCR','CVE','STN','LYD','ERN','DJF','KMF','MRU','ALL','BAM','MKD','MDL','GEL','AMD','AZN','KGS','TJS','TMT','AFN','IQD','IRR','JOD','KWD','LBP','OMR','BHD','YER','BTN','BND','TWD','HKD','MOP','AWG','ANG','SRD','GYD','PYG','UYU','BOB','CRC','GTQ','HNL','NIO','DOP','JMD','TTD','BSD','BBD','BZD','HTG','CUP','XCD','FKP','GIP','KYD','BMD','SHP','SBD','VUV','WST','TOP','ZWL'].includes(currency)) err('Choose a supported payment currency.');
      const country=String(body.country||'').trim().toUpperCase();
      if(country && !/^[A-Z]{2}$/.test(country)) err('Choose a valid country.');
      const terms=String(body.terms||'').trim().slice(0,500);
      const addressSnap=await db.collection('walletAddresses').doc(decoded.uid).get();
      const addressData=addressSnap.exists?addressSnap.data():{}; const sellerAddress=String(addressData.addresses?.[asset]||(asset==='BNG'?addressData.address:'')||'');
      if(!sellerAddress) err('Your internal '+asset+' wallet is not ready. Open the wallet page and try again.',409);
      const idNew=crypto.randomBytes(16).toString('hex'); const transactionId='BNG-TX-'+idNew.toUpperCase(); const ref=db.collection(COLLECTION).doc(idNew); const wref=walletRef(decoded.uid);
      const result=await db.runTransaction(async tx=>{
        const ws=await tx.get(wref); const wallet=ws.exists?ws.data():{};
        const key=assetKey(asset), balance=Math.max(0,Number(wallet[key]||0)), bngBalance=Math.max(0,Number(wallet.bng||0));
        const feeRate=P2P_FEE_RATE, feeBng=round8(amount*bngPerAsset*feeRate);
        let assetBalanceAfter=balance,bngBalanceAfter=bngBalance;
        if(side==='sell') {
          if(balance+1e-8<amount) err('Insufficient '+asset+' balance to lock this P2P offer. Available: '+balance+' '+asset+'.',400);
          if(asset==='BNG') {
            if(bngBalance+1e-8<amount+feeBng) err('Insufficient BNG balance to lock the offer and pay the 0.878690% P2P fee.',400);
            bngBalanceAfter=round8(bngBalance-amount-feeBng); assetBalanceAfter=bngBalanceAfter;
            tx.set(wref,{uid:decoded.uid,bng:bngBalanceAfter,updatedAt:now},{merge:true});
          } else {
            if(bngBalance+1e-8<feeBng) err('Insufficient BNG to pay the 0.878690% P2P fee. You need '+feeBng+' BNG.',400);
            assetBalanceAfter=round8(balance-amount); bngBalanceAfter=round8(bngBalance-feeBng);
            tx.set(wref,{uid:decoded.uid,[key]:assetBalanceAfter,bng:bngBalanceAfter,updatedAt:now},{merge:true});
          }
          tx.create(db.collection('walletTransactions').doc(idNew+'_escrow_lock'),{uid:decoded.uid,transactionId,type:'p2p_escrow_lock',escrowId:idNew,asset,amount,status:'locked_internal_escrow',createdAt:now,ledgerOnly:true});
          tx.create(db.collection('walletTransactions').doc(idNew+'_p2p_fee'),{uid:decoded.uid,transactionId,type:'p2p_fee',escrowId:idNew,asset:'BNG',amount:feeBng,feeAsset:'BNG',sourceAsset:asset,sourceAmount:amount,feeRate,status:'completed_internal_ledger',createdAt:now,ledgerOnly:true});
        }
        tx.create(ref,{escrowId:idNew,transactionId,offerTitle,side,asset,country,sellerUid:side==='sell'?decoded.uid:'',sellerEmail:side==='sell'?String(decoded.email||''):'',sellerAddress:side==='sell'?sellerAddress:'',buyerUid:side==='buy'?decoded.uid:'',buyerEmail:side==='buy'?String(decoded.email||''):'',buyerAddress:side==='buy'?sellerAddress:'',amount,fee:side==='sell'?feeBng:0,estimatedFeeBng:feeBng,feeAsset:'BNG',feeRate,bngPerAsset,paymentMethod,pricePerBng,pricePerAsset:pricePerBng,currency,terms,paymentReference:'',status:'open',escrowFunded:side==='sell',escrowFundedAt:side==='sell'?now:null,escrowFundedByUid:side==='sell'?decoded.uid:'',escrowFundedByRole:side==='sell'?'seller':'',escrowFundedAsset:asset,escrowFundedAmount:side==='sell'?amount:0,createdAt:now,expiresAt:offerExpiresAt,expirationMode,renewedAt:null,updatedAt:now,ledgerOnly:true});
        return {escrowId:idNew,transactionId,offerTitle,side,asset,lockedAmount:side==='sell'?amount:0,fee:side==='sell'?feeBng:0,feeBng:side==='sell'?feeBng:0,feeAsset:'BNG',feeRate,pricePerAsset:pricePerBng,currency,expectedPayment:Math.round(amount*pricePerBng*100)/100,status:'open',assetBalance:assetBalanceAfter,bngBalance:bngBalanceAfter,ledgerOnly:true};
      });
      return json(200,result);
    }
    if(!escrowRef || !/^[a-f0-9]{32}$/.test(id)) err('Enter a valid internal escrow ID.');
    let acceptRate=null;
    if(action==='accept') {
      await expireOpenOffers(db, admin);
      const peek=await escrowRef.get();
      if(!peek.exists) err('Escrow offer not found.',404);
      const peekData=peek.data(), peekAsset=String(peekData.asset||'BNG').toUpperCase();
      if((peekData.side||'sell')==='buy') {
        acceptRate=peekAsset==='BNG'?1:Number((await getBngRates())[peekAsset]);
        if(!Number.isFinite(acceptRate)||acceptRate<=0) err('No valid reference rate is available for '+peekAsset+'. This offer cannot be accepted safely right now.',503);
      }
    }
    const result=await db.runTransaction(async tx=>{
      const es=await tx.get(escrowRef); if(!es.exists) err('Escrow offer not found.',404);
      const e=es.data(); const amount=Number(e.amount||0); const asset=String(e.asset||'BNG').toUpperCase(); if(!SUPPORTED_ASSETS.includes(asset)) err('This legacy offer uses an unsupported asset.',409); const key=assetKey(asset); const transactionId=String(e.transactionId||('P2P-TX-'+id.toUpperCase()));
      if(action==='accept') {
        if(e.status!=='open') err('This offer is no longer available.',409);
        if(e.sellerUid===decoded.uid || e.buyerUid===decoded.uid) err('You cannot accept your own offer.');
        const addrSnap=await tx.get(db.collection('walletAddresses').doc(decoded.uid)); const ad=addrSnap.exists?addrSnap.data():{};
        const acceptingAddress=String(ad.addresses?.[asset]||(asset==='BNG'?ad.address:'')||'');
        if((e.side||'sell')==='buy') {
          const sellerRef=walletRef(decoded.uid); const sw=await tx.get(sellerRef); const sellerWallet=sw.exists?sw.data():{};
          const sellerBalance=Math.max(0,Number(sellerWallet[key]||0)), sellerBng=Math.max(0,Number(sellerWallet.bng||0));
          const feeRate=Number(e.feeRate||P2P_FEE_RATE), currentBngPerAsset=Number(acceptRate||e.bngPerAsset||1), feeBng=round8(amount*currentBngPerAsset*feeRate);
          if(amount*currentBngPerAsset < 10-1e-8) err('This offer is now below the 10 BNG-equivalent minimum at the current reference rate.',409);
          if(sellerBalance+1e-8<amount) err('Insufficient '+asset+' balance to lock this buy offer. Available: '+sellerBalance+' '+asset+'.',400);
          if(asset==='BNG') {
            if(sellerBng+1e-8<amount+feeBng) err('Insufficient BNG to lock the offer and pay the 0.878690% P2P fee.',400);
            tx.set(sellerRef,{uid:decoded.uid,bng:round8(sellerBng-amount-feeBng),updatedAt:now},{merge:true});
          } else {
            if(sellerBng+1e-8<feeBng) err('Insufficient BNG to pay the 0.878690% P2P fee. You need '+feeBng+' BNG.',400);
            tx.set(sellerRef,{uid:decoded.uid,[key]:round8(sellerBalance-amount),bng:round8(sellerBng-feeBng),updatedAt:now},{merge:true});
          }
          tx.update(escrowRef,{sellerUid:decoded.uid,sellerEmail:String(decoded.email||''),sellerAddress:acceptingAddress,fee:feeBng,feeAsset:'BNG',feeRate,buyerUid:e.buyerUid,buyerEmail:e.buyerEmail||'',buyerAddress:e.buyerAddress||'',status:'accepted',escrowFunded:true,escrowFundedAt:now,escrowFundedByUid:decoded.uid,escrowFundedByRole:'seller',escrowFundedAsset:asset,escrowFundedAmount:amount,acceptedAt:now,updatedAt:now});
          tx.create(db.collection('walletTransactions').doc(id+'_escrow_lock'),{uid:decoded.uid,transactionId,type:'p2p_escrow_lock',escrowId:id,asset,amount,status:'locked_internal_escrow',createdAt:now,ledgerOnly:true});
          tx.create(db.collection('walletTransactions').doc(id+'_p2p_fee'),{uid:decoded.uid,transactionId,type:'p2p_fee',escrowId:id,asset:'BNG',amount:feeBng,feeAsset:'BNG',sourceAsset:asset,sourceAmount:amount,feeRate,status:'completed_internal_ledger',createdAt:now,ledgerOnly:true});
        } else {
          tx.update(escrowRef,{buyerUid:decoded.uid,buyerEmail:String(decoded.email||''),buyerAddress:acceptingAddress,status:'accepted',acceptedAt:now,updatedAt:now});
        }
        tx.create(db.collection('walletTransactions').doc(id+'_accepted'),{uid:decoded.uid,transactionId,type:'p2p_escrow_accepted',escrowId:id,asset,amount,status:'accepted_internal_escrow',createdAt:now});
        return {escrowId:id,status:'accepted',amount,escrowFunded:true,fundedAsset:asset,fundedAmount:amount,fundingRole:'seller',message:(e.side||'sell')==='buy'?'You accepted the buy offer and the required '+amount+' '+asset+' has been locked in internal escrow.':'Offer accepted; the seller’s asset was already locked in internal escrow.',ledgerOnly:true};
      }
      if(action==='paid') {
        if(e.buyerUid!==decoded.uid) err('Only the buyer on this escrow can mark payment sent.',403);
        if(e.status!=='accepted') err('This escrow is not awaiting payment.',409);
        const refText=String(body.paymentReference||'').trim().slice(0,120);
        tx.update(escrowRef,{status:'paid',paymentReference:refText,buyerMarkedPaidAt:now,updatedAt:now});
        return {escrowId:id,status:'paid',message:'Payment marked as sent. The seller must verify it before releasing '+asset+'.',ledgerOnly:true};
      }
      if(action==='release') {
        if(e.sellerUid!==decoded.uid) err('Only the seller can release the escrow.',403);
        if(e.status!=='paid') err('The buyer must mark payment sent before you release '+asset+'.',409);
        const buyerRef=walletRef(e.buyerUid); const bs=await tx.get(buyerRef); const bal=Math.max(0,Number(bs.exists?bs.data()[key]||0:0));
        tx.set(buyerRef,{uid:e.buyerUid,[key]:Math.round((bal+amount)*1e6)/1e6,updatedAt:now},{merge:true});
        tx.update(escrowRef,{status:'released',releasedAt:now,updatedAt:now});
        tx.create(db.collection('walletTransactions').doc(id+'_release_seller'),{uid:e.sellerUid,transactionId,type:'p2p_escrow_released',escrowId:id,toUid:e.buyerUid,asset,amount,status:'completed_internal_escrow',createdAt:now});
        tx.create(db.collection('walletTransactions').doc(id+'_release_buyer'),{uid:e.buyerUid,transactionId,type:'p2p_escrow_received',escrowId:id,fromUid:e.sellerUid,asset,amount,status:'completed_internal_escrow',createdAt:now});
        return {escrowId:id,status:'released',amount,ledgerOnly:true};
      }

      if(action==='renew') {
        const side=e.side||'sell', ownerUid=side==='buy'?e.buyerUid:e.sellerUid;
        if(ownerUid!==decoded.uid) err('Only the member who created this offer can renew it.',403);
        if(!['open','expired'].includes(e.status)) err('Only an open or expired offer can be renewed. Active trades do not expire.',409);
        const expirationMode=String(body.expirationMode||'20m');
        if(!Object.prototype.hasOwnProperty.call(OFFER_EXPIRATIONS,expirationMode)) err('Choose a supported renewal duration.');
        const expiresAt=OFFER_EXPIRATIONS[expirationMode]===null?null:Date.now()+OFFER_EXPIRATIONS[expirationMode];
        if(e.status==='expired' && side==='sell') {
          const sellerRef=walletRef(decoded.uid), ws=await tx.get(sellerRef), wallet=ws.exists?ws.data():{};
          const key=assetKey(asset), balance=Math.max(0,Number(wallet[key]||0));
          if(balance+1e-8<amount) err('Insufficient '+asset+' balance to renew this offer. Available: '+balance+' '+asset+'.',400);
          tx.set(sellerRef,{uid:decoded.uid,[key]:round8(balance-amount),updatedAt:now},{merge:true});
          tx.create(db.collection('walletTransactions').doc(id+'_renew_'+Date.now()),{
            uid:decoded.uid,transactionId,type:'p2p_escrow_renew_lock',escrowId:id,asset,amount,
            status:'locked_internal_escrow',createdAt:now,ledgerOnly:true
          });
        }
        tx.update(escrowRef,{status:'open',expiresAt,expirationMode,renewedAt:now,expiredAt:null,updatedAt:now});
        return {escrowId:id,status:'open',expiresAt,expirationMode,message:expirationMode==='never'?'Offer renewed with no expiration.':'Offer renewed for '+({ '20m':'20 minutes','1h':'1 hour','6h':'6 hours','12h':'12 hours','24h':'24 hours','7d':'7 days' }[expirationMode])+'.',ledgerOnly:true};
      }
      if(action==='cancel') {
        const side=e.side||'sell'; const ownerUid=side==='buy'?e.buyerUid:e.sellerUid;
        if(ownerUid!==decoded.uid) err('Only the member who created this offer can cancel it.',403);
        if(e.status!=='open') err('Only an unaccepted offer can be cancelled.',409);
        if(side==='sell') { const sellerRef=walletRef(e.sellerUid); const ss=await tx.get(sellerRef); const bal=Math.max(0,Number(ss.exists?ss.data()[key]||0:0)); tx.set(sellerRef,{uid:e.sellerUid,[key]:Math.round((bal+amount)*1e6)/1e6,updatedAt:now},{merge:true}); tx.create(db.collection('walletTransactions').doc(id+'_cancel'),{uid:e.sellerUid,transactionId,type:'p2p_escrow_unlock',escrowId:id,asset,amount,status:'returned_internal_escrow',createdAt:now}); }
        tx.update(escrowRef,{status:'cancelled',cancelledAt:now,updatedAt:now});
        return {escrowId:id,status:'cancelled',refunded:side==='sell'?amount:0,ledgerOnly:true};
      }
      if(action==='dispute') {
        if(![e.sellerUid,e.buyerUid].includes(decoded.uid)) err('Only the seller or buyer can open a dispute.',403);
        if(!['accepted','paid'].includes(e.status)) err('This escrow cannot be disputed in its current status.',409);
        tx.update(escrowRef,{status:'disputed',disputeReason:String(body.reason||'Payment or trade issue').trim().slice(0,300),disputedBy:decoded.uid,disputedAt:now,updatedAt:now});
        return {escrowId:id,status:'disputed',message:'Funds remain locked. Contact BANG BNG support for manual review.',ledgerOnly:true};
      }
      if(action==='admin-refund' || action==='admin-release') {
        if(decoded.admin!==true) err('Administrator authorization is required.',403);
        if(e.status!=='disputed') err('Only disputed escrow can be resolved by an administrator.',409);
        if(action==='admin-release') {
          const buyerRef=walletRef(e.buyerUid); const bs=await tx.get(buyerRef); const bal=Math.max(0,Number(bs.exists?bs.data()[key]||0:0));
          tx.set(buyerRef,{uid:e.buyerUid,[key]:Math.round((bal+amount)*1e6)/1e6,updatedAt:now},{merge:true});
          tx.update(escrowRef,{status:'released',resolvedBy:decoded.uid,resolvedAt:now,updatedAt:now});
          tx.create(db.collection('walletTransactions').doc(id+'_admin_release'),{uid:e.buyerUid,transactionId,type:'p2p_escrow_admin_release',escrowId:id,fromUid:e.sellerUid,asset,amount,status:'completed_internal_escrow',createdAt:now});
          return {escrowId:id,status:'released',amount,ledgerOnly:true};
        }
        const sellerRef=walletRef(e.sellerUid); const ss=await tx.get(sellerRef); const bal=Math.max(0,Number(ss.exists?ss.data()[key]||0:0));
        tx.set(sellerRef,{uid:e.sellerUid,[key]:Math.round((bal+amount)*1e6)/1e6,updatedAt:now},{merge:true});
        tx.update(escrowRef,{status:'refunded',resolvedBy:decoded.uid,resolvedAt:now,updatedAt:now});
        tx.create(db.collection('walletTransactions').doc(id+'_admin_refund'),{uid:e.sellerUid,transactionId,type:'p2p_escrow_admin_refund',escrowId:id,asset,amount,status:'returned_internal_escrow',createdAt:now});
        return {escrowId:id,status:'refunded',refunded:amount,ledgerOnly:true};
      }
      if(action==='rate') {
        if(!['released'].includes(e.status)) err('You can rate only a completed trade.',409);
        if(![e.sellerUid,e.buyerUid].includes(decoded.uid)) err('Only this trade’s buyer or seller can rate it.',403);
        const score=Number(body.score); if(!Number.isInteger(score)||score<1||score>5) err('Choose a rating from 1 to 5 stars.');
        const targetUid=decoded.uid===e.sellerUid?e.buyerUid:e.sellerUid; const reviewRef=db.collection('p2pRatings').doc(id+'_'+decoded.uid);
        const old=await tx.get(reviewRef); if(old.exists) err('You have already rated this trade.',409);
        tx.create(reviewRef,{escrowId:id,transactionId,asset,fromUid:decoded.uid,toUid:targetUid,score,comment:String(body.comment||'').trim().slice(0,300),createdAt:now,ledgerOnly:true});
        tx.update(escrowRef,{ratingsUpdatedAt:now,updatedAt:now}); return {escrowId:id,status:'released',rated:true,message:'Rating submitted.'};
      }
      err('Unknown escrow action.');
    });
    return json(200,result);
  } catch(error) {
    const status=Number(error.statusCode)||500;
    if(status>=500) console.error('internal P2P escrow failed:',error);
    return json(status,{error:status===500?'Unable to process internal escrow right now.':error.message});
  }
};
