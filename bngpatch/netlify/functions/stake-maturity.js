const crypto=require('crypto');
const { getAdmin, json } = require('./lib/firebase-admin');
const DAY_MS=86400000, RATE=0.10, TERM=30;
const round6=n=>Math.round((Number(n)+Number.EPSILON)*1e6)/1e6;
exports.config={schedule:'*/5 * * * *'};
exports.handler=async()=>{
  try{
    const admin=getAdmin(),db=admin.firestore(),now=Date.now();
    const snap=await db.collection('bngStakes').where('status','==','active').where('maturityAtMs','<=',now).limit(200).get();
    let paid=0;
    for(const doc of snap.docs){
      const stakeRef=doc.ref, s=doc.data(), uid=s.uid;
      if(!uid)continue;
      const walletRef=db.collection('walletBalances').doc(uid), txRef=db.collection('walletTransactions').doc('stake_'+doc.id+'_maturity'), transactionId='BNG-TX-'+crypto.randomBytes(16).toString('hex').toUpperCase();
      const didPay=await db.runTransaction(async tx=>{
        const [ss,ws,ts]=await Promise.all([tx.get(stakeRef),tx.get(walletRef),tx.get(txRef)]);
        if(!ss.exists||ss.data().status!=='active'||Number(ss.data().maturityAtMs||Infinity)>Date.now()||ts.exists)return false;
        const d=ss.data(), principal=round6(Number(d.amount||0)); if(!(principal>0))return false;
        const reward=round6(principal*RATE), payout=round6(principal+reward), balance=round6(Math.max(0,Number(ws.exists?ws.data().bng||0:0))+payout);
        tx.set(walletRef,{uid,bng:balance,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        const paidAtMs=Date.now();
        tx.update(stakeRef,{status:'matured_paid',rewardPaid:reward,payout,paidAtMs,maturityTransactionId:transactionId,updatedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAtMs:paidAtMs});
        tx.create(txRef,{uid,transactionId,type:'stake_maturity_payout',asset:'BNG',stakeId:doc.id,amount:payout,principal,reward,status:'completed_internal_ledger',createdAt:admin.firestore.FieldValue.serverTimestamp(),createdAtMs:paidAtMs,ledgerOnly:true,publicVerification:true});
        return true;
      });
      if(didPay)paid++;
    }
    return json(200,{ok:true,paid,checked:snap.size,ledgerOnly:true});
  }catch(error){console.error('stake maturity job failed:',error);return json(500,{error:'Stake maturity processing failed.'});}
};
