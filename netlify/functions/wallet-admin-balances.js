const { requireUser, json } = require('./lib/firebase-admin');
const ASSETS={BNG:'bng',BTC:'btc',BNB:'bnb',USDT:'usdt',ADA:'ada',BCH:'bch',ETH:'eth',SOL:'sol',DOGE:'doge',XRP:'xrp'};
const round=n=>Math.round((Number(n)+Number.EPSILON)*1e8)/1e8;
const err=(m,s=400)=>{const e=new Error(m);e.statusCode=s;return e;};
exports.handler=async event=>{
  try{
    const {admin,decoded}=await requireUser(event);
    if(decoded.admin!==true)return json(403,{error:'Administrator access required.'});
    const db=admin.firestore();
    if(event.httpMethod==='GET'){
      const uid=String(event.queryStringParameters?.uid||'').trim();
      if(!uid)return json(400,{error:'Enter a target Firebase user ID.'});
      const snap=await db.collection('walletBalances').doc(uid).get(),d=snap.exists?snap.data():{};
      return json(200,{uid,balances:Object.fromEntries(Object.entries(ASSETS).map(([asset,field])=>[asset,Math.max(0,Number(d[field]||0))])),ledgerOnly:true,note:'Internal ledger balances only; not proof of external reserves or on-chain assets.'});
    }
    if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'});
    let b={};try{b=JSON.parse(event.body||'{}')}catch(_){return json(400,{error:'Invalid request body.'})}
    const uid=String(b.uid||'').trim(),asset=String(b.asset||'').toUpperCase(),action=String(b.action||''),amount=Number(b.amount),reason=String(b.reason||'').trim();
    if(!uid||uid.length>128)return json(400,{error:'Enter a valid target user ID.'});
    if(!Object.prototype.hasOwnProperty.call(ASSETS,asset))return json(400,{error:'Choose a supported asset: BNG, BTC, BNB, USDT, ADA, BCH, ETH, SOL, DOGE or XRP.'});
    if(!['credit','debit','set'].includes(action))return json(400,{error:'Choose credit, debit, or set.'});
    if(!Number.isFinite(amount)||amount<0||amount>1e15||round(amount)!==amount)return json(400,{error:'Enter a valid non-negative amount with up to 8 decimal places.'});
    if(reason.length<8||reason.length>500)return json(400,{error:'Provide an audit reason between 8 and 500 characters.'});
    const ref=db.collection('walletBalances').doc(uid),auditRef=db.collection('adminBalanceAudits').doc(),txRef=db.collection('walletTransactions').doc('admin_balance_'+auditRef.id);
    const result=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref),d=snap.exists?snap.data():{},field=ASSETS[asset],before=Math.max(0,Number(d[field]||0));
      let after=action==='credit'?round(before+amount):action==='debit'?round(before-amount):round(amount);
      if(after<0)throw err('Cannot debit below zero.',409);
      const now=admin.firestore.FieldValue.serverTimestamp();
      tx.set(ref,{uid,[field]:after,updatedAt:now,adminBalanceUpdatedAt:now},{merge:true});
      tx.create(auditRef,{targetUid:uid,asset,action,amount,before,after,reason,adminUid:decoded.uid,createdAt:now,ledgerOnly:true});
      tx.create(txRef,{uid,type:'admin_balance_'+action,asset,amount:Math.abs(after-before),before,after,reason,adminUid:decoded.uid,status:'completed_admin_adjustment',createdAt:now,ledgerOnly:true});
      return {ok:true,uid,asset,action,before,after,auditId:auditRef.id,ledgerOnly:true,note:'This is an internal ledger adjustment only. It does not create or verify external reserves.'};
    });
    return json(200,result);
  }catch(error){const status=Number(error.statusCode)||500;if(status>=500)console.error('wallet-admin-balances failed:',error);return json(status,{error:status===500?'Unable to process administrator balance action.':error.message});}
};
