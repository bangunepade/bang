const { json } = require('./lib/firebase-admin');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { success:false, error:'POST required.' });
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error('TURNSTILE_SECRET_KEY is not configured.');
    return json(503, { success:false, error:'Security verification is temporarily unavailable. Please try again later.' });
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { success:false, error:'Invalid request.' }); }

  const token = typeof body.token === 'string' ? body.token : '';
  if (!token || token.length > 2048) return json(400, { success:false, error:'Complete the security check and try again.' });

  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    const ip = event.headers?.['x-nf-client-connection-ip'] || event.headers?.['X-Nf-Client-Connection-Ip'];
    if (ip && !/[,\s]/.test(ip)) form.set('remoteip', String(ip).slice(0, 64));

    const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    if (!verifyResponse.ok) throw new Error('Cloudflare verification service returned an error.');
    const result = await verifyResponse.json();
    const allowedHosts = new Set(['1bang.top', 'www.1bang.top']);
    if (!result.success || !allowedHosts.has(String(result.hostname || '').toLowerCase())) {
      return json(403, { success:false, error:'Security verification failed. Please retry the challenge.' });
    }
    return json(200, { success:true });
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return json(503, { success:false, error:'Could not verify the security check. Please try again.' });
  }
};
