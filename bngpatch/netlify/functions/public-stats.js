const { getStore } = require("@netlify/blobs");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async () => {
  try {
    const store = getStore({ name: "bang-analytics", consistency: "strong" });
    const now = Date.now();
    const cutoff = now - 5 * 60 * 1000;
    const { blobs = [] } = await store.list({ prefix: "sessions/" });

    let visitors = 0, active = 0, connect = 0;
    for (const b of blobs) {
      const s = await store.get(b.key, { type: "json" }).catch(() => null);
      if (!s) continue;
      visitors++;
      if ((s.lastSeen || 0) >= cutoff) active++;
      if (s.connect) connect++;
    }

    return json(200, {
      ok: true,
      generatedAt: now,
      counts: { visitors, active, connect },
      privacy: "No IP addresses are returned by this public endpoint."
    });
  } catch (e) {
    return json(503, {
      ok: false,
      counts: { visitors: 0, active: 0, connect: 0 }
    });
  }
};
