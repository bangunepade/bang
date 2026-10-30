(function(){
  const id='bng-simulated-market-ribbon';
  function mount(){
    if(document.getElementById(id)||!document.body)return;
    const bar=document.createElement('aside');bar.id=id;
    bar.style.cssText='position:sticky;top:0;z-index:9999;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:8px 12px;background:linear-gradient(90deg,#10051f,#241044,#10051f);border-bottom:1px solid #8b5cf6;color:#f5edff;font:700 12px system-ui;box-shadow:0 4px 18px #0005';
    bar.innerHTML='<span style="color:#c4b5fd">BNG REFERENCE PRICE</span><strong id="bng-sim-price" style="font-size:16px">$—</strong><span style="color:#fcd34d;border:1px solid #8a6b27;border-radius:999px;padding:3px 7px">INTERNAL REFERENCE</span><span style="opacity:.8">Internal reference only · not a live exchange quote</span>';
    document.body.prepend(bar);
  }
  async function update(){
    try{const r=await fetch('/api/bng-price?pair=BNGUSDT',{cache:'no-store'});const d=await r.json();if(!r.ok||!d.simulated)return;
      const el=document.getElementById('bng-sim-price');if(el)el.textContent='$'+Number(d.priceUsd).toFixed(4);
    }catch(_){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  update();setInterval(update,30000);
})();