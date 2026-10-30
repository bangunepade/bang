/* BANG BNG global local-time display. Uses the visitor's browser locale and IANA time zone automatically. */
(() => {
  const boot = () => {
    if (document.getElementById('bngGlobalClock')) return;
    const isHomePage = location.pathname === '/' || /\/index\.html$/i.test(location.pathname);
    const clock = document.createElement('aside');
    clock.id = 'bngGlobalClock';
    clock.setAttribute('aria-label', 'Your local date and time');
    clock.innerHTML = '<span class="bng-clock-dot" aria-hidden="true"></span><span class="bng-clock-copy"><b id="bngClockTime">Local time</b><small id="bngClockDate"></small><small id="bngClockZone"></small></span>';
    const style = document.createElement('style');
    style.textContent = '#bngGlobalClock{position:fixed;right:12px;bottom:12px;z-index:9990;display:flex;align-items:center;gap:9px;max-width:calc(100vw - 24px);padding:9px 12px;border:1px solid rgba(148,163,184,.35);border-radius:13px;background:rgba(10,15,28,.94);box-shadow:0 8px 28px #0004;color:#f8fafc;font:12px/1.35 system-ui,sans-serif;backdrop-filter:blur(12px);pointer-events:none}#bngGlobalClock .bng-clock-dot{width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 10px #34d399;flex:0 0 auto}#bngGlobalClock .bng-clock-copy{display:grid;gap:1px}#bngGlobalClock b{font-size:13px;font-variant-numeric:tabular-nums}#bngGlobalClock small{color:#cbd5e1;font-size:10px}@media(max-width:520px){#bngGlobalClock{right:8px;bottom:8px;padding:7px 9px}#bngGlobalClock small{font-size:9px}}';
    if (isHomePage) style.textContent += '#bngGlobalClock{top:12px;bottom:auto;right:12px;}@media(max-width:520px){#bngGlobalClock{top:8px;bottom:auto;right:8px}}';
    document.head.appendChild(style); document.body.appendChild(clock);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local device time';
    const timeFmt = new Intl.DateTimeFormat(undefined, {hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    const dateFmt = new Intl.DateTimeFormat(undefined, {weekday:'short',year:'numeric',month:'short',day:'2-digit'});
    const tick = () => { const now = new Date(); const t=document.getElementById('bngClockTime'),d=document.getElementById('bngClockDate'),z=document.getElementById('bngClockZone'); if(t)t.textContent=timeFmt.format(now);if(d)d.textContent=dateFmt.format(now);if(z)z.textContent=zone+' · local time'; };
    tick(); setInterval(tick,1000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
