const { getStore } = require("@netlify/blobs");


function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok:false, error:"POST required" });

  try {
    const body = JSON.parse(event.body || "{}");
    const sessionId = String(body.sessionId || "").slice(0,120);
    const action = String(body.action || "visit").slice(0,40);
    const page = String(body.page || "/").slice(0,300);
    if (!sessionId) return json(400, { ok:false, error:"sessionId required" });

    const now = Date.now();
    const store = getStore({ name: "bang-analytics", consistency: "strong" });
    const sessionKey = `sessions/${sessionId}`;
    const previous = await store.get(sessionKey, { type: "json" }).catch(() => null);

    const record = {
      sessionId,
      page,
      action,
      lastSeen: now,
      firstSeen: previous?.firstSeen || now,
      userAgent: String(event.headers?.["user-agent"] || "").slice(0,500),
      referrer: String(body.referrer || "").slice(0,500),
      connect: action === "connect" || Boolean(previous?.connect),
      connectAt: action === "connect" ? now : (previous?.connectAt || null)
    };

    await store.setJSON(sessionKey, record);

    // Keep a compact event trail for recent activity.
    const eventKey = `events/${now}-${Math.random().toString(36).slice(2,10)}`;
    await store.setJSON(eventKey, {
      sessionId, action, page, at: now
    });

    return json(200, { ok:true, sessionId, action, serverTime: now });
  } catch (e) {
    return json(500, { ok:false, error:"Tracking error" });
  }
};
