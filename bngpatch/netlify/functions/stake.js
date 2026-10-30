const crypto = require('crypto');
const { requireUser, json } = require('./lib/firebase-admin');
const DAY_MS = 86400000;
const FULL_TERM_DAYS = 30;
const FULL_TERM_RATE = 0.10;
const FEE_RATE = 0.00878690;
const round6 = n => Math.round((Number(n) + Number.EPSILON) * 1e6) / 1e6;
const newTxId = () => 'BNG-TX-' + crypto.randomBytes(16).toString('hex').toUpperCase();
const iso = value => value && typeof value.toDate === 'function' ? value.toDate().toISOString() : (typeof value === 'string' ? value : null);
const err = (message, statusCode=400) => { const e = new Error(message); e.statusCode = statusCode; return e; };

exports.handler = async (event) => {
  try {
    const { admin, decoded } = await requireUser(event);
    const db = admin.firestore();
    const uid = decoded.uid;
    if (event.httpMethod === 'GET') {
      const snap = await db.collection('bngStakes').where('uid','==',uid).get();
      const stakes = snap.docs.map(doc => { const d=doc.data(); return { id:doc.id, transactionId:String(d.transactionId||''), withdrawalTransactionId:String(d.withdrawalTransactionId||''), maturityTransactionId:String(d.maturityTransactionId||''), amount:Number(d.amount||0), startedAtMs:Number(d.startedAtMs||0), maturityAtMs:Number(d.maturityAtMs||0), createdAt:iso(d.createdAt), createdAtMs:Number(d.createdAtMs||d.startedAtMs||0), withdrawnAtMs:Number(d.withdrawnAtMs||d.paidAtMs||0), status:String(d.status||'active'), rewardRate:FULL_TERM_RATE, termDays:FULL_TERM_DAYS, updatedAtMs:Number(d.updatedAtMs||0), rewardEstimate:round6(Number(d.amount||0)*FULL_TERM_RATE*Math.min(1,Math.max(0,(Date.now()-Number(d.startedAtMs||Date.now()))/(FULL_TERM_DAYS*DAY_MS)))) }; }).sort((a,b)=>b.startedAtMs-a.startedAtMs);
      return json(200,{stakes,fullTermRate:FULL_TERM_RATE,termDays:FULL_TERM_DAYS,proRataRatePerDay:FULL_TERM_RATE/FULL_TERM_DAYS,ledgerOnly:true});
    }
    if (event.httpMethod !== 'POST') return json(405,{error:'Method not allowed.'});
    let body={}; try { body=JSON.parse(event.body||'{}'); } catch (_) { return json(400,{error:'Invalid request body.'}); }
    if (body.action === 'create') {
      const amount=Number(body.amount);
      if (!Number.isFinite(amount)||amount<100||amount>10000000||round6(amount)!==amount) return json(400,{error:'Stake amount must be between 100 and 10,000,000 BNG (up to 6 decimal places).'});
      const miningRef=db.collection('miningUsers').doc(uid), stakeRef=db.collection('bngStakes').doc(crypto.randomUUID());
      const transactionId=newTxId(), txRef=db.collection('walletTransactions').doc(transactionId);
      const now=Date.now();
      const result=await db.runTransaction(async tx=>{
        const snap=await tx.get(miningRef); const d=snap.exists?snap.data():{};
        let pending=Math.max(0,Number(d.pending||0)); const running=d.running===true; const started=Number(d.startedAtMs||0);
        let total=Math.max(0,Number(d.total||0)); if(running&&started>0){const earned=Math.max(0,(now-started)/DAY_MS); pending+=earned; total+=earned;}
        pending=round6(pending);
        if(pending+1e-9<amount) throw err('Insufficient available mined BNG. Stop mining or wait for more rewards, then retry.',400);
        const fee=round6(amount*FEE_RATE), netStake=round6(amount-fee); const nextPending=round6(pending-amount);
        tx.set(miningRef,{uid,pending:nextPending,total,running,startedAtMs:running?now:0,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        tx.create(stakeRef,{uid,amount:netStake,requestedAmount:amount,fee,feeRate:FEE_RATE,asset:'BNG',status:'active',transactionId,startedAtMs:now,createdAtMs:now,maturityAtMs:now+FULL_TERM_DAYS*DAY_MS,termDays:FULL_TERM_DAYS,fullTermRate:FULL_TERM_RATE,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAtMs:now});
        tx.create(txRef,{uid,transactionId,type:'stake_deposit',stakeId:stakeRef.id,asset:'BNG',amount:netStake,requestedAmount:amount,fee,principal:netStake,status:'completed_internal_ledger',createdAt:admin.firestore.FieldValue.serverTimestamp(),createdAtMs:now,ledgerOnly:true,publicVerification:true});
        return {id:stakeRef.id,transactionId,amount:netStake,requestedAmount:amount,fee,pending:nextPending,maturityAtMs:now+FULL_TERM_DAYS*DAY_MS,createdAtMs:now};
      });
      return json(200,{ok:true,...result,message:'Stake created. The 10% reward applies after 30 days to the net stake; a 0.878690% internal fee was deducted. This is an internal ledger, not an on-chain payment guarantee.'});
    }
    if (body.action === 'withdraw') {
      const stakeId=String(body.stakeId||''); if(!/^[A-Za-z0-9_-]{10,80}$/.test(stakeId)) return json(400,{error:'Invalid stake ID.'});
      const stakeRef=db.collection('bngStakes').doc(stakeId), walletRef=db.collection('walletBalances').doc(uid), txRef=db.collection('walletTransactions').doc('stake_'+stakeId+'_withdraw'), transactionId=newTxId();
      const result=await db.runTransaction(async tx=>{
        const [ss,ws,ts]=await Promise.all([tx.get(stakeRef),tx.get(walletRef),tx.get(txRef)]);
        if(!ss.exists||ss.data().uid!==uid) throw err('Stake not found.',404);
        const s=ss.data(); if(s.status!=='active') throw err('This stake has already been paid or withdrawn.',409);
        if(ts.exists) throw err('This stake payout has already been processed.',409);
        const now=Date.now(), elapsed=Math.max(0,now-Number(s.startedAtMs||now));
        if(now<Number(s.maturityAtMs||0)) throw err('Stakes can only be withdrawn after the full 30-day term.',400);
        const reward=round6(Number(s.amount||0)*FULL_TERM_RATE);
        const payout=round6(Number(s.amount||0)+reward), balance=round6(Math.max(0,Number(ws.exists?ws.data().bng||0:0))+payout);
        tx.set(walletRef,{uid,bng:balance,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        tx.update(stakeRef,{status:now>=Number(s.maturityAtMs||0)?'matured_withdrawn':'early_withdrawn',withdrawnAtMs:now,principal:Number(s.amount||0),rewardPaid:reward,payout,withdrawalTransactionId:transactionId,updatedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAtMs:now});
        tx.create(txRef,{uid,transactionId,type:'stake_withdrawal',asset:'BNG',stakeId,amount:payout,principal:Number(s.amount||0),reward,status:'completed_internal_ledger',createdAt:admin.firestore.FieldValue.serverTimestamp(),createdAtMs:now,ledgerOnly:true,publicVerification:true});
        return {transactionId,principal:round6(Number(s.amount||0)),reward,payout,walletBng:balance,status:now>=Number(s.maturityAtMs||0)?'matured_withdrawn':'early_withdrawn',createdAtMs:now};
      });
      return json(200,{ok:true,...result,ledgerOnly:true});
    }
    return json(400,{error:'Unknown stake action.'});
  } catch(error) { const status=Number(error.statusCode)||500; if(status>=500) console.error('stake endpoint failed:',error); return json(status,{error:status===500?'Unable to process staking request right now.':error.message}); }
};
