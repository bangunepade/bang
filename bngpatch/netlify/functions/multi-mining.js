const { requireUser, json } = require('./lib/firebase-admin');
const RATES = Object.freeze({ BNG:1.5, BTC:0.000012, USDT:1, ADA:4.52, BCH:0.0036, ETH:0.00041, SOL:0.0095, DOGE:3, XRP:0.8 });
const FIELDS = Object.freeze({ BNG:'bng', BTC:'btc', USDT:'usdt', ADA:'ada', BCH:'bch', ETH:'eth', SOL:'sol', DOGE:'doge', XRP:'xrp' });
const DAY=86400000, MAX_SESSION=48*60*60*1000;
const round=(n)=>Math.round((Number(n)+Number.EPSILON)*1e10)/1e10;
const bad=(m,s=400)=>Object.assign(new Error(m),{statusCode:s});
exports.handler=async event=>{
 if(!['GET','POST'].includes(event.httpMethod))return json(405,{error:'Method not allowed.'});
 try{
  const {admin,decoded}=await requireUser(event),db=admin.firestore();let body={};if(event.httpMethod==='POST'){try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request body.'})}}
  const requested=String(body.asset||'').toUpperCase();if(requested&&requested!=='BNG')throw bad('Only BNG can be mined. Other assets are available through the BNG swap page.');
  const userRef=db.collection('multiMiningUsers').doc(decoded.uid),walletRef=db.collection('walletBalances').doc(decoded.uid),now=Date.now();
  const result=await db.runTransaction(async tx=>{
   const [ms,ws]=await Promise.all([tx.get(userRef),tx.get(walletRef)]);const m=ms.exists?ms.data():{},w=ws.exists?ws.data():{};
   const balances={...(m.balances||{})};let running=m.running===true,selected='BNG',started=Number(m.startedAtMs||0),last=Number(m.lastAccruedAtMs||started||0);
   selected='BNG';
   if(running&&last>0){const end=Math.min(now,started+MAX_SESSION),delta=Math.max(0,end-last);if(delta>0){const earned=round(delta/DAY*RATES[selected]);balances[selected]=round((Number(balances[selected])||0)+earned);w[FIELDS[selected]]=round((Number(w[FIELDS[selected]])||0)+earned);}last=end;if(now>=started+MAX_SESSION){running=false;started=0;last=0;}}
   if(event.httpMethod==='POST'){
    const action=String(body.action||'switch');
    if(action==='start'){if(!running){running=true;started=now;last=now;} }
    else if(action==='stop'){running=false;started=0;last=0;}
    else if(action==='switch'){if(!requested)throw bad('Select an asset first.');selected=requested;if(running){started=now;last=now;}}
    else throw bad('Unknown mining action.');
   }
   const assetBalances={};for(const [asset,field] of Object.entries(FIELDS))assetBalances[asset]=Math.max(0,Number(w[field])||0);
   tx.set(userRef,{uid:decoded.uid,email:String(decoded.email||''),balances,selectedAsset:selected,running,startedAtMs:started,lastAccruedAtMs:last,updatedAt:admin.firestore.FieldValue.serverTimestamp(),ledgerOnly:true},{merge:true});
   tx.set(walletRef,{uid:decoded.uid,...w,...Object.fromEntries(Object.entries(FIELDS).map(([a,f])=>[f,Math.max(0,Number(w[f])||0)])),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
   return {ratesPerDay:{BNG:RATES.BNG},balances,assetBalances,selectedAsset:selected,running,startedAtMs:started,serverTime:new Date(now).toISOString(),ledgerOnly:true,notice:'Internal website ledger only. These entries are not mined blockchain assets or guaranteed payouts.'};
  });return json(200,result);
 }catch(e){const s=Number(e.statusCode)||500;if(s>=500)console.error('multi-mining failed:',e);return json(s,{error:s===500?'Unable to update multi-asset mining.':e.message});}
};
