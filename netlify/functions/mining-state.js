const {requireUser,json}=require('./lib/firebase-admin');
const {getPromoConfig,accrued,accruedBtc,cappedEnd,currentRatePerDay,MAX_SESSION_MS,INTERNAL_BTC_PER_DAY}=require('./lib/mining-rate');
exports.handler=async event=>{
 if(event.httpMethod!=='GET'&&event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'});
 try{
  const {admin,decoded}=await requireUser(event),db=admin.firestore();
  const [snap,config]=await Promise.all([db.collection('miningUsers').doc(decoded.uid).get(),getPromoConfig(admin)]);
  const d=snap.exists?snap.data():{},pending=Math.max(0,Number(d.pending||0)),total=Math.max(0,Number(d.total||0)),btcPending=Math.max(0,Number(d.btcPending||0)),btcTotal=Math.max(0,Number(d.btcTotal||0)),running=d.running===true,startedAtMs=Math.max(0,Number(d.startedAtMs||0)),now=Date.now();
  const effectiveEnd=running&&startedAtMs>0?cappedEnd(startedAtMs,now):now,earned=running&&startedAtMs>0?accrued(startedAtMs,effectiveEnd,config):0,btcEarned=running&&startedAtMs>0?0:0,sessionExpired=running&&startedAtMs>0&&now>=startedAtMs+MAX_SESSION_MS,ps=Number(config.promoStartAtMs||0),pe=Number(config.promoEndAtMs||0);
  return json(200,{pending,total,btcPending,btcTotal,running:running&&!sessionExpired,sessionExpired,startedAtMs,currentPending:pending+earned,currentTotal:total+earned,currentBtcPending:btcPending+btcEarned,currentBtcTotal:btcTotal+btcEarned,btcRatePerDay:INTERNAL_BTC_PER_DAY,stateUpdatedAt:(d.updatedAt&&typeof d.updatedAt.toDate==='function'?d.updatedAt.toDate().toISOString():null),serverTime:new Date(now).toISOString(),sessionDurationHours:48,ratePerDay:currentRatePerDay(now,config),normalRatePerDay:1.5,boostPerMinute:Number(config.boostPerMinute||1e12),promoStartAtMs:ps,promoEndAtMs:pe,promoActive:ps>0&&now<pe,ledgerOnly:true});
 }catch(error){const status=Number(error.statusCode)||500;if(status>=500)console.error('mining-state failed:',error);return json(status,{error:status===500?'Unable to load mining state right now.':error.message});}
};
