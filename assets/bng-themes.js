(function(){
  const themes={
    gold:{label:'Gold',color:'#f6b72c'},blue:{label:'Blue',color:'#4da3ff'},dark:{label:'Black & Silver',color:'#b8b8c4'},purple:{label:'Purple',color:'#a970ff'},green:{label:'Green',color:'#39d98a'},red:{label:'Red & Black',color:'#ff5364'},orange:{label:'Orange',color:'#ff8a24'},pink:{label:'Pink',color:'#ff70b8'},teal:{label:'Teal',color:'#35d6c5'},ocean:{label:'Ocean',color:'#2878ff'},sunset:{label:'Sunset',color:'#ff6b4a'},rose:{label:'Rose',color:'#ff8c9d'},lime:{label:'Lime',color:'#b6e343'},ice:{label:'Ice Blue',color:'#8be9ff'},coffee:{label:'Coffee',color:'#c58b5b'},neon:{label:'Neon',color:'#c5ff35'}
  };
  const key='bang-bng-theme';
  let saved='purple';try{saved=localStorage.getItem(key)||'purple'}catch(e){}
  document.documentElement.dataset.bngTheme=themes[saved]?saved:'purple';
  function apply(name){if(!themes[name])name='purple';document.documentElement.dataset.bngTheme=name;try{localStorage.setItem(key,name)}catch(e){};document.querySelectorAll('[data-bng-theme-label]').forEach(x=>x.textContent=themes[name].label)}
  function mount(){
    if(document.querySelector('.bng-theme-wrap'))return;
    const wrap=document.createElement('div');wrap.className='bng-theme-wrap';
    wrap.innerHTML='<button class="bng-theme-button" type="button" aria-label="Choose chat theme" aria-expanded="false">🎨 <span class="theme-label" data-bng-theme-label></span> ▾</button><div class="bng-theme-menu" role="menu"></div>';
    const menu=wrap.querySelector('.bng-theme-menu');
    Object.entries(themes).forEach(([id,t])=>{const b=document.createElement('button');b.type='button';b.className='bng-theme-option';b.setAttribute('role','menuitem');b.innerHTML='<span class="bng-theme-dot" style="color:'+t.color+';background:'+t.color+'"></span>'+t.label;b.onclick=()=>{apply(id);menu.classList.remove('open');wrap.querySelector('.bng-theme-button').setAttribute('aria-expanded','false')};menu.appendChild(b)});
    wrap.querySelector('.bng-theme-button').onclick=()=>{const open=menu.classList.toggle('open');wrap.querySelector('.bng-theme-button').setAttribute('aria-expanded',String(open))};
    document.addEventListener('click',e=>{if(!wrap.contains(e.target)){menu.classList.remove('open');wrap.querySelector('.bng-theme-button').setAttribute('aria-expanded','false')}});
    const chatTop=document.querySelector('.top > div:last-child');
    const nav=document.querySelector('nav');
    if(chatTop)chatTop.prepend(wrap); else if(nav)nav.querySelector('.navlinks')?.insertAdjacentElement('afterend',wrap); else document.body.appendChild(wrap);
    if(!chatTop&&!nav){wrap.style.position='fixed';wrap.style.top='14px';wrap.style.right='14px';}
    apply(document.documentElement.dataset.bngTheme||'purple');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();

  // Automatically rotate through every supported theme every five minutes.
  // The first automatic change happens five minutes after the page loads.
  const themeOrder=Object.keys(themes);
  window.setInterval(()=>{
    const current=document.documentElement.dataset.bngTheme||'purple';
    const currentIndex=themeOrder.indexOf(current);
    const next=themeOrder[(currentIndex+1+themeOrder.length)%themeOrder.length];
    apply(next);
  },300000);

  window.BNGThemes={apply,themes};
})();
