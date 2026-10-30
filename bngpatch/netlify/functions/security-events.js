const { getStore } = require('@netlify/blobs');
const { requireUser, json } = require('./lib/firebase-admin');

const PREFIX = 'security-events/';
const allowedEvents = new Set(['registration', 'login', 'google_sign_in']);
function clientIp(event) {
  // Netlify's platform-provided client connection header; never trust a browser-supplied IP.
  const value = event.headers?.['x-nf-client-connection-ip'] || event.headers?.['X-Nf-Client-Connection-Ip'] || '';
  const ip = String(value).trim();
  if (!ip || ip.length > 64 || /[,\s]/.test(ip)) return null;
  return ip;
}
exports.handler = async event => {
  try {
    const { admin, decoded } = await requireUser(event);
    const store = getStore({ name: 'bang-security-events', consistency: 'strong' });
    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { ok:false, error:'Invalid request body.' }); }
      const eventType = String(body.eventType || '');
      if (!allowedEvents.has(eventType)) return json(400, { ok:false, error:'Unsupported event type.' });
      const now = Date.now();
      const record = {
        eventId: `${now}-${Math.random().toString(36).slice(2, 12)}`,
        uid: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email.slice(0, 254) : null,
        eventType,
        ip: clientIp(event),
        userAgent: String(event.headers?.['user-agent'] || '').slice(0, 400),
        at: now,
        ipCapture: clientIp(event) ? 'netlify-client-connection' : 'unavailable'
      };
      await store.setJSON(PREFIX + record.eventId, record);
      return json(200, { ok:true, recorded:true, ipCaptured:Boolean(record.ip) });
    }
    if (event.httpMethod === 'GET') {
      if (decoded.admin !== true) return json(403, { ok:false, error:'Administrator access required.' });
      const { blobs = [] } = await store.list({ prefix: PREFIX });
      const keys = blobs.map(x => x.key).sort().reverse().slice(0, 500);
      const records = [];
      for (const key of keys) {
        const record = await store.get(key, { type:'json' }).catch(() => null);
        if (record) records.push(record);
      }
      const byIp = {};
      for (const r of records) if (r.ip) byIp[r.ip] = (byIp[r.ip] || 0) + 1;
      return json(200, { ok:true, generatedAt:Date.now(), total:records.length,
        ipUnavailable:records.filter(r=>!r.ip).length,
        repeatedIps:Object.entries(byIp).filter(([,count])=>count>1).map(([ip,count])=>({ip,count})).sort((a,b)=>b.count-a.count).slice(0,100),
        records });
    }
    return json(405, { ok:false, error:'GET or POST required.' });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('security-events failed:', error);
    return json(status, { ok:false, error:status === 500 ? 'Security logging is unavailable.' : error.message });
  }
};
