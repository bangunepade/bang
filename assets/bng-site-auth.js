import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signOut,
  getAdditionalUserInfo
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";

// Use the same default Firebase app as wallet.html, mining.html, and stake.html.
// A separately named app creates a separate Auth instance and makes signed-in users appear signed out on other pages.
const app = getApps().find(a => a.name === "[DEFAULT]") || initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
// Cloudflare Turnstile protection for account sign-in, registration and Google sign-in.
const BNG_TURNSTILE_SITE_KEY = "REPLACE_WITH_CLOUDFLARE_TURNSTILE_SITE_KEY";
let bngTurnstileScriptPromise = null;
async function getTurnstileToken() {
  if (!BNG_TURNSTILE_SITE_KEY || BNG_TURNSTILE_SITE_KEY.startsWith("REPLACE_")) {
    throw new Error("Security verification is not configured yet. Please contact the site administrator.");
  }
  if (!window.turnstile) {
    if (!bngTurnstileScriptPromise) {
      bngTurnstileScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true; script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Could not load the security verification. Check your connection and try again."));
        document.head.appendChild(script);
      });
    }
    await bngTurnstileScriptPromise;
  }
  const mount = document.getElementById("bngTurnstileWidget");
  if (!mount || !window.turnstile) throw new Error("Security verification is unavailable. Refresh and try again.");
  mount.innerHTML = "";
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finishError = message => { if (!settled) { settled = true; reject(new Error(message)); } };
    try {
      window.turnstile.render(mount, {
        sitekey: BNG_TURNSTILE_SITE_KEY,
        theme: "dark",
        size: "flexible",
        callback: token => {
          if (settled) return;
          settled = true;
          resolve(token);
        },
        "expired-callback": () => finishError("Security check expired. Please try again."),
        "error-callback": () => finishError("Security check failed. Please retry.")
      });
    } catch (_) { finishError("Security verification could not start. Please refresh and try again."); }
  });
}
async function verifyTurnstile() {
  const token = await getTurnstileToken();
  const response = await fetch("/api/turnstile-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || "Security verification failed. Please try again.");
  return true;
}

provider.setCustomParameters({ prompt: "select_account" });


async function logSecurityEvent(user, eventType) {
  try { const token = await user.getIdToken(); await fetch("/api/security-events", {method:"POST", headers:{"Content-Type":"application/json", "Authorization":"Bearer "+token}, body:JSON.stringify({eventType}), keepalive:true}); } catch (_) { /* logging failure must not block sign-in */ }
}

const isCommunity = /(^|\/)community\.html$/i.test(location.pathname);
const isPublicP2P = /(^|\/)p2p\.html$/i.test(location.pathname);
const isHomePage = location.pathname === "/" || /(^|\/)index\.html$/i.test(location.pathname);
const SESSION_KEY = "bngAuthStartedAt";
let logoutTimer = null;
function enforceOneHourSession(user) {
  clearTimeout(logoutTimer);
  if (!user) { localStorage.removeItem(SESSION_KEY); return; }
  let started = Number(localStorage.getItem(SESSION_KEY) || 0);
  if (!started) {
    started = Date.now();
    localStorage.setItem(SESSION_KEY, String(started));
  }
  const elapsed = Date.now() - started;
  if (elapsed >= 3600000) {
    signOut(auth).catch(console.error);
    return;
  }
  logoutTimer = setTimeout(() => signOut(auth).catch(console.error), 3600000 - elapsed);
}

function makeGate() {
  if (document.getElementById("bngSiteAuthGate")) return;
  const gate = document.createElement("div");
  gate.id = "bngSiteAuthGate";
  gate.innerHTML = `
    <div class="bng-site-auth-box">
      <div class="bng-site-auth-logo">BNG</div>
      <h1 id="bngSiteAuthTitle">Welcome to BANG BNG</h1>
      <p id="bngSiteAuthSub">Sign in or create an account to enter 1bang.top.</p>
      <section class="bng-prelogin-features" aria-label="Platform features">
        <div class="bng-prelogin-feature"><span class="bng-feature-icon">⛏</span><div><strong>Daily Mining</strong><small>Explore BNG mining features</small></div></div>
        <div class="bng-prelogin-feature"><span class="bng-feature-icon">⇄</span><div><strong>Wallet & Swap</strong><small>View supported digital assets</small></div></div>
        <div class="bng-prelogin-feature"><span class="bng-feature-icon">↔</span><div><strong>P2P Marketplace</strong><small>Browse offers and payment methods</small></div></div>
        <div class="bng-prelogin-feature"><span class="bng-feature-icon">◈</span><div><strong>Staking & Help Centre</strong><small>Get help and explore staking</small></div></div>
      </section>
      <p class="bng-prelogin-note">Create an account to access member features. Availability and rewards are subject to platform rules.</p>
      <button class="bng-site-google" id="bngSiteGoogle">Continue with Google</button>
      <div class="bng-site-or"><span></span>OR<span></span></div>
      <div id="bngSiteNameWrap" style="display:none"><input id="bngSiteName" placeholder="Username" autocomplete="name"></div>
      <input id="bngSiteEmail" type="email" placeholder="Email address" autocomplete="email">
      <div class="bng-password-wrap"><input id="bngSitePassword" type="password" placeholder="Password" autocomplete="current-password"><button type="button" class="bng-password-toggle" id="bngSitePasswordToggle" aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
      <div id="bngTurnstileWrap" class="bng-turnstile-wrap"><div id="bngTurnstileWidget"></div><small>Security check powered by Cloudflare</small></div>
      <button class="bng-site-primary" id="bngSiteSubmit">Sign In</button>
      <button class="bng-site-forgot" id="bngSiteForgot">Forgot password?</button>
      <div class="bng-site-switch"><span id="bngSiteSwitchText">Don't have an account?</span> <button id="bngSiteSwitch">Sign Up</button></div>
      <div class="bng-site-error" id="bngSiteError"></div>
    </div>`;
  document.body.appendChild(gate);
  const password = gate.querySelector("#bngSitePassword");
  const toggle = gate.querySelector("#bngSitePasswordToggle");
  if (password && toggle) toggle.addEventListener("click", () => {
    const reveal = password.type === "password";
    password.type = reveal ? "text" : "password";
    toggle.innerHTML = reveal ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.5 0 2.8-.4 4-1"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    toggle.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    toggle.setAttribute("aria-pressed", String(reveal));
    password.focus();
  });
  return gate;
}

function installStyles() {
  if (document.getElementById("bngSiteAuthStyles")) return;
  const style = document.createElement("style");
  style.id = "bngSiteAuthStyles";
  style.textContent = `
    #bngSiteAuthGate{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:20px;background:radial-gradient(circle at 50% 0%,rgba(246,183,44,.12),transparent 42%),#050403;color:#f7f4fb;font-family:Arial,sans-serif;overflow:auto}
    #bngSiteAuthGate.show{display:flex}
    .bng-site-auth-box{width:min(490px,100%);padding:24px;border:1px solid var(--theme-line,#3d2b0e);border-radius:20px;background:rgba(14,10,5,.97);box-shadow:0 25px 80px #000b;text-align:center}
    .bng-prelogin-features{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:0 0 12px;text-align:left}
    .bng-prelogin-feature{display:flex;align-items:center;gap:10px;min-width:0;padding:10px;border:1px solid #3a3040;border-radius:12px;background:linear-gradient(135deg,rgba(246,183,44,.09),rgba(169,112,255,.06))}
    .bng-feature-icon{flex:0 0 32px;width:32px;height:32px;display:grid;place-items:center;border-radius:9px;background:var(--theme-accent,#f6b72c);color:#100b02;font-size:19px;font-weight:900}
    .bng-prelogin-feature strong{display:block;font-size:12px;color:#fff;margin-bottom:3px}
    .bng-prelogin-feature small{display:block;font-size:10px;line-height:1.35;color:#b9b0c1}
    .bng-prelogin-note{font-size:10px!important;line-height:1.4;margin:0 0 12px!important;color:#958b9c!important}
    @media(max-width:420px){#bngSiteAuthGate{padding:10px;align-items:flex-start}.bng-site-auth-box{padding:18px 14px;margin:auto 0}.bng-prelogin-features{gap:6px}.bng-prelogin-feature{padding:8px;gap:7px}.bng-feature-icon{flex-basis:27px;width:27px;height:27px;font-size:16px}.bng-prelogin-feature strong{font-size:11px}.bng-prelogin-feature small{font-size:9px}}
    .bng-site-auth-logo{width:58px;height:58px;margin:0 auto 14px;border-radius:16px;display:grid;place-items:center;font-weight:1000;color:#050403;background:linear-gradient(135deg,var(--theme-accent2,#ffe18a),var(--theme-accent,#f6b72c));box-shadow:0 0 35px var(--theme-glow,rgba(246,183,44,.18))}
    .bng-site-auth-box h1{margin:0 0 8px;font-size:25px}.bng-site-auth-box p{margin:0 0 20px;color:#aaa0ad;font-size:13px}
    .bng-site-auth-box input{box-sizing:border-box;width:100%;margin:5px 0;padding:12px 13px;border-radius:10px;border:1px solid #3a3040;background:#0b0810;color:#fff;outline:none}
    .bng-site-auth-box input:focus{border-color:var(--theme-accent,#f6b72c)}
    .bng-site-google,.bng-site-primary,.bng-site-forgot,.bng-site-switch button{font:inherit;cursor:pointer}
    .bng-site-google{width:100%;padding:12px;border:1px solid #dadce0;border-radius:10px;background:#fff;color:#202124;font-weight:800}
    .bng-site-primary{width:100%;margin-top:8px;padding:12px;border:0;border-radius:10px;background:linear-gradient(135deg,var(--theme-accent2,#ffe18a),var(--theme-accent,#f6b72c));color:#050403;font-weight:900}
    .bng-site-forgot{border:0;background:transparent;color:var(--theme-accent2,#ffe18a);font-size:12px;margin:10px 0}.bng-site-switch{font-size:12px;color:#999;margin-top:6px}.bng-site-switch button{border:0;background:none;color:var(--theme-accent,#f6b72c);font-weight:800}
    .bng-site-or{display:flex;align-items:center;gap:8px;margin:13px 0;color:#756b80;font-size:11px}.bng-site-or span{height:1px;background:#2a2038;flex:1}
    .bng-turnstile-wrap{display:flex;flex-direction:column;align-items:center;gap:5px;margin:12px auto 4px;min-height:68px}.bng-turnstile-wrap small{font-size:10px;color:#938ba1}
    .bng-site-error{min-height:17px;margin-top:10px;color:#ff6b7a;font-size:12px}
    html[data-bng-theme="blue"] #bngSiteAuthGate{background:radial-gradient(circle at 50% 0%,rgba(77,163,255,.14),transparent 42%),#030914}
    html[data-bng-theme="purple"] #bngSiteAuthGate{background:radial-gradient(circle at 50% 0%,rgba(169,112,255,.14),transparent 42%),#090512}
    html[data-bng-theme="green"] #bngSiteAuthGate{background:radial-gradient(circle at 50% 0%,rgba(57,217,138,.12),transparent 42%),#03100b}
    html[data-bng-theme="red"] #bngSiteAuthGate{background:radial-gradient(circle at 50% 0%,rgba(255,83,100,.12),transparent 42%),#110507}
    html[data-bng-theme="dark"] #bngSiteAuthGate{background:radial-gradient(circle at 50% 0%,rgba(255,255,255,.08),transparent 42%),#050505}
  
    .bng-password-wrap{position:relative;width:100%;margin:0 0 10px}
    .bng-password-wrap input{box-sizing:border-box;width:100%;padding-right:52px}
    .bng-password-toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:#e7c5ff;padding:7px;cursor:pointer}
    .bng-password-toggle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.bng-password-toggle:focus-visible{outline:2px solid #d9a7ff;outline-offset:2px}
`;
  document.head.appendChild(style);
}

function friendlyError(e){
  const code=e?.code||"";
  const map={
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/invalid-email":"Please enter a valid email address.",
    "auth/email-already-in-use":"That email is already registered. Try signing in.",
    "auth/weak-password":"Password should be at least 6 characters.",
    "auth/popup-closed-by-user":"Google sign-in was cancelled.",
    "auth/popup-blocked":"Your browser blocked the Google sign-in window. Allow popups and try again."
  };
  return map[code]||e?.message||"Authentication failed. Please try again.";
}

function initGate(){
  if(isCommunity || isPublicP2P){
    document.body.classList.add("bng-auth-ready");
    return;
  }
  installStyles();
  const gate=makeGate();
  let mode="login";
  const title=document.getElementById("bngSiteAuthTitle");
  const sub=document.getElementById("bngSiteAuthSub");
  const nameWrap=document.getElementById("bngSiteNameWrap");
  const name=document.getElementById("bngSiteName");
  const email=document.getElementById("bngSiteEmail");
  const password=document.getElementById("bngSitePassword");
  const submit=document.getElementById("bngSiteSubmit");
  const forgot=document.getElementById("bngSiteForgot");
  const switchBtn=document.getElementById("bngSiteSwitch");
  const switchText=document.getElementById("bngSiteSwitchText");
  const google=document.getElementById("bngSiteGoogle");
  const error=document.getElementById("bngSiteError");

  function setMode(next){
    mode=next;
    const signup=mode==="signup";
    title.textContent=signup?"Create your BANG BNG account":"Welcome to BANG BNG";
    sub.textContent=signup?"Create an account to unlock the BANG BNG platform.":"Sign in to continue to 1bang.top.";
    nameWrap.style.display=signup?"block":"none";
    name.required=signup;
    submit.textContent=signup?"Create Account":"Sign In";
    forgot.style.display=signup?"none":"inline-block";
    switchText.textContent=signup?"Already have an account?":"Don't have an account?";
    switchBtn.textContent=signup?"Sign In":"Sign Up";
    error.textContent="";
  }
  setMode("login");
  switchBtn.onclick=()=>setMode(mode==="login"?"signup":"login");
  google.onclick=async()=>{try{error.textContent="";google.disabled=true;await verifyTurnstile();const credential=await signInWithPopup(auth,provider);const info=getAdditionalUserInfo(credential);await logSecurityEvent(credential.user,info?.isNewUser?"registration":"google_sign_in")}catch(e){error.textContent=friendlyError(e)}finally{google.disabled=false}};
  submit.onclick=async()=>{
    try{
      error.textContent="";
      submit.disabled=true;
      await verifyTurnstile();
      if(mode==="signup") {
        const userCred = await createUserWithEmailAndPassword(auth,email.value.trim(),password.value);
        await logSecurityEvent(userCred.user,"registration");
        const username = name.value.trim();
        if(username) await updateProfile(userCred.user,{displayName:username});
      } else { const credential=await signInWithEmailAndPassword(auth,email.value.trim(),password.value); await logSecurityEvent(credential.user,"login"); }
    }catch(e){error.textContent=friendlyError(e)}finally{submit.disabled=false}
  };
  forgot.onclick=async()=>{
    try{error.textContent="";const v=email.value.trim();if(!v){error.textContent="Enter your email address first.";return}await verifyTurnstile();await sendPasswordResetEmail(auth,v);error.style.color="#39d98a";error.textContent="Password reset email sent."}catch(e){error.style.color="#ff6b7a";error.textContent=friendlyError(e)}
  };

  if (isHomePage) {
    const homeSignOut = document.getElementById("homeSignOut");
    if (homeSignOut) {
      homeSignOut.addEventListener("click", async () => {
        homeSignOut.disabled = true;
        homeSignOut.textContent = "Signing Out…";
        try {
          await signOut(auth);
        } catch (e) {
          console.error("Home-page sign out failed:", e);
          homeSignOut.disabled = false;
          homeSignOut.textContent = "Sign Out";
          error.textContent = friendlyError(e);
        }
      });
    }
  }

  onAuthStateChanged(auth,user=>{
    enforceOneHourSession(user);
    if (isHomePage) {
      const homeSignOut = document.getElementById("homeSignOut");
      if (homeSignOut) {
        homeSignOut.style.display = user ? "inline-block" : "none";
        homeSignOut.disabled = false;
        homeSignOut.textContent = "Sign Out";
      }
    }
    document.body.classList.add("bng-auth-ready");
    if(user){gate.classList.remove("show");document.body.classList.remove("bng-auth-locked");}
    else{gate.classList.add("show");document.body.classList.add("bng-auth-locked");}
  });
}

function boot(){
  try{ initGate(); }catch(e){
    if(!isCommunity && !isPublicP2P){
      document.body.classList.add("bng-auth-ready");
      let gate=document.getElementById("bngSiteAuthGate");
      if(!gate){
        installStyles();
        gate=makeGate();
      }
      gate.classList.add("show");
      document.body.classList.add("bng-auth-locked");
      const err=document.getElementById("bngSiteAuthError") || document.getElementById("bngSiteAuthSub");
      if(err) err.textContent="Authentication could not load. Please refresh the page.";
      const controls=gate.querySelectorAll("button,input");
      controls.forEach(x=>x.disabled=true);
    }
  }
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
