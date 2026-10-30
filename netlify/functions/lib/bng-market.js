// Deterministic BNG demo reference price. This is simulation data, not exchange data.
function getSimulatedBngPrice(now = Date.now()) {
  const start = Date.UTC(2025, 7, 1), day = 86400000;
  const i = Math.max(0, Math.floor((now - start) / day));
  const wave = 0.50 + 0.25*Math.sin(i*0.071) + 0.13*Math.sin(i*0.019+1.7) + 0.07*Math.sin(i*0.31);
  return Number(Math.max(0.30, Math.min(1.00, wave)).toFixed(4));
}
module.exports = { getSimulatedBngPrice };
