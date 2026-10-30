const PROMO_DOC='globalMiningConfig', PROMO_ID='temporaryBoost';
const BOOST_PER_MINUTE=0, BOOST_DURATION_MS=0, NORMAL_PER_DAY=1.5, MAX_SESSION_MS=48*60*60*1000;
// BTC is an internal demonstration ledger rate, not real Bitcoin mining or a promise of payout.
const INTERNAL_BTC_PER_DAY=Number(process.env.INTERNAL_BTC_PER_DAY || 0.000012);
async function ensurePromoWindow(admin){
 // Promotional boost retired: all new mining uses the fixed daily rate.
 return {promoStartAtMs:0,promoEndAtMs:0,boostPerMinute:0,normalPerDay:NORMAL_PER_DAY,campaign:'fixed_daily_internal_ledger_rates',ledgerOnly:true};
}
async function getPromoConfig(admin){
 // Ignore any historical promotional configuration so it cannot inflate new accruals.
 return {promoStartAtMs:0,promoEndAtMs:0,boostPerMinute:0,normalPerDay:NORMAL_PER_DAY,ledgerOnly:true};
}
function cappedEnd(startMs,endMs){const s=Math.max(0,Number(startMs)||0),e=Math.max(s,Number(endMs)||0);return Math.min(e,s+MAX_SESSION_MS);}
function accrued(startMs,endMs,c){
 const s=Math.max(0,Number(startMs)||0), e=cappedEnd(s,endMs); if(!s||e<=s)return 0;
 const normal=NORMAL_PER_DAY, boost=Number(c.boostPerMinute)>0?Number(c.boostPerMinute):BOOST_PER_MINUTE;
 const ps=Number(c.promoStartAtMs)||0, pe=Number(c.promoEndAtMs)||0;
 if(!ps||!pe||pe<=ps)return (e-s)/86400000*normal;
 const overlap=Math.max(0,Math.min(e,pe)-Math.max(s,ps));
 return Math.max(0,(e-s)-overlap)/86400000*normal+overlap/60000*boost;
}
function currentRatePerDay(now,c){const ps=Number(c.promoStartAtMs)||0,pe=Number(c.promoEndAtMs)||0;return ps>0&&now>=ps&&now<pe?Number(c.boostPerMinute||BOOST_PER_MINUTE)*1440:NORMAL_PER_DAY;}
function accruedBtc(startMs,endMs){const s=Math.max(0,Number(startMs)||0),e=cappedEnd(s,endMs);if(!s||e<=s)return 0;return (e-s)/86400000*INTERNAL_BTC_PER_DAY;}
module.exports={ensurePromoWindow,getPromoConfig,accrued,accruedBtc,cappedEnd,currentRatePerDay,BOOST_PER_MINUTE,BOOST_DURATION_MS,NORMAL_PER_DAY,MAX_SESSION_MS,INTERNAL_BTC_PER_DAY};
