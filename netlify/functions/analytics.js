const { getStore } = require("@netlify/blobs");

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}
function getKey(event) {
  const h=event.headers||{};
  const auth=h.authorization||h.Authorization||"";
  if(auth.startsWith("Bearer ")) return auth.slice(7);
  return (event.queryStringParameters||{}).key || "";
}
exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405,{ok:false,error:"GET required"});
  const expected = process.env.BANG_ANALYTICS_KEY;
  if (!expected || getKey(event) !== expected) return json(401,{ok:false,error:"Unauthorized"});

  try {
    const store = getStore({ name:"bang-analytics", consistency:"strong" });
    const now = Date.now();
    const cutoff = now - 5 * 60 * 1000;
    const { blobs=[] } = await store.list({ prefix:"sessions/" });
    const sessions = [];
    for (const b of blobs) {
      const s = await store.get(b.key,{type:"json"}).catch(()=>null);
      if (s) sessions.push(s);
    }
    sessions.sort((a,b)=>(b.lastSeen||0)-(a.lastSeen||0));

    const visitors = sessions.length;
    const active = sessions.filter(s=>(s.lastSeen||0)>=cutoff);
    const connected = sessions.filter(s=>s.connect);
    const recent = sessions.slice(0,50).map(s=>({
      page:s.page, lastSeen:s.lastSeen, firstSeen:s.firstSeen,
      status:(s.connect ? "connect" : ((s.lastSeen||0)>=cutoff ? "active" : "visit")),
      userAgent:s.userAgent, referrer:s.referrer
    }));

    return json(200,{
      ok:true, generatedAt:now,
      counts:{visitors,active:active.length,connect:connected.length},
      active:active.map(s=>({page:s.page,lastSeen:s.lastSeen,status:s.connect?"connect":"active"})),
      recent
    });
  } catch(e) {
    return json(500,{ok:false,error:"Analytics unavailable"});
  }
};
