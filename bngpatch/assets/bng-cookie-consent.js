/* BANG BNG — privacy-first cookie consent */
(function () {
  'use strict';

  var CONSENT_COOKIE = 'bng_cookie_consent';
  var YEAR = 60 * 60 * 24 * 365;

  function readCookie(name) {
    var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function saveChoice(choice) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = CONSENT_COOKIE + '=' + encodeURIComponent(choice) +
      '; Max-Age=' + YEAR + '; Path=/; SameSite=Lax' + secure;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showConfirmation(message) {
    var old = document.getElementById('bng-cookie-toast');
    if (old) old.remove();
    var toast = element('div', '', message);
    toast.id = 'bng-cookie-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    window.setTimeout(function () { if (toast.isConnected) toast.remove(); }, 4500);
  }

  function init() {
    if (readCookie(CONSENT_COOKIE)) return;

    var style = element('style');
    style.textContent = `
      #bng-cookie-banner{position:fixed;z-index:2147483000;left:18px;right:18px;bottom:18px;
        width:min(720px,calc(100% - 36px));margin:0 auto;box-sizing:border-box;padding:22px;
        color:#f7f5ff;background:linear-gradient(145deg,#171020,#0c1018);
        border:1px solid rgba(166,105,255,.55);border-radius:18px;
        box-shadow:0 18px 60px rgba(0,0,0,.58);font:14px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #bng-cookie-banner *{box-sizing:border-box}
      #bng-cookie-banner .bng-cookie-top{display:flex;align-items:center;gap:10px;margin-bottom:9px}
      #bng-cookie-banner .bng-cookie-mark{display:grid;place-items:center;width:36px;height:36px;flex:0 0 36px;
        border-radius:11px;background:linear-gradient(135deg,#7b2cff,#18b981);font-size:18px}
      #bng-cookie-banner h2{font-size:18px;line-height:1.25;margin:0;color:#fff;font-weight:800}
      #bng-cookie-banner p{margin:0 0 12px;color:#d7d1e2}
      #bng-cookie-banner .bng-cookie-note{font-size:12px;color:#aaa2b8;margin-bottom:17px}
      #bng-cookie-banner .bng-cookie-actions{display:flex;flex-wrap:wrap;gap:10px}
      #bng-cookie-banner button{min-height:43px;padding:10px 17px;border-radius:10px;
        border:1px solid transparent;font:700 13px system-ui,sans-serif;cursor:pointer;transition:filter .15s,transform .15s}
      #bng-cookie-banner button:hover{filter:brightness(1.12);transform:translateY(-1px)}
      #bng-cookie-banner button:focus-visible{outline:3px solid #b7ffdf;outline-offset:3px}
      #bng-cookie-accept{background:linear-gradient(110deg,#7d35ed,#4c27bd);color:#fff}
      #bng-cookie-reject{background:#20232d;border-color:#555064;color:#fff}
      #bng-cookie-banner .bng-cookie-footer{margin-top:13px;font-size:11px;color:#938ba1}
      #bng-cookie-toast{position:fixed;z-index:2147483001;right:18px;bottom:18px;max-width:calc(100vw - 36px);
        padding:12px 16px;border:1px solid #22c98a;border-radius:12px;background:#0b2118;color:#eafff3;
        box-shadow:0 8px 30px #0009;font:13px/1.45 system-ui,sans-serif}
      @media(max-width:520px){#bng-cookie-banner{left:10px;right:10px;bottom:10px;width:calc(100% - 20px);padding:17px}
        #bng-cookie-banner .bng-cookie-actions{display:grid;grid-template-columns:1fr}
        #bng-cookie-banner button{width:100%}}
      @media(prefers-reduced-motion:reduce){#bng-cookie-banner button{transition:none}}
    `;
    document.head.appendChild(style);

    var banner = element('section');
    banner.id = 'bng-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-labelledby', 'bng-cookie-title');
    banner.setAttribute('aria-describedby', 'bng-cookie-description');

    var top = element('div', 'bng-cookie-top');
    top.appendChild(element('span', 'bng-cookie-mark', '🍪'));
    var title = element('h2', '', 'Your privacy matters');
    title.id = 'bng-cookie-title';
    top.appendChild(title);

    var description = element('p', '', 'BANG BNG uses essential cookies to keep the website working and remember your cookie choice. With your permission, optional cookies may be used to improve your experience.');
    description.id = 'bng-cookie-description';

    var note = element('p', 'bng-cookie-note', 'You can accept all cookies or reject optional cookies. Essential cookies remain active because the site needs them to function.');

    var actions = element('div', 'bng-cookie-actions');
    var accept = element('button', '', 'Accept all cookies');
    accept.id = 'bng-cookie-accept';
    accept.type = 'button';
    var reject = element('button', '', 'Reject optional cookies');
    reject.id = 'bng-cookie-reject';
    reject.type = 'button';

    function finish(choice, message) {
      saveChoice(choice);
      banner.remove();
      showConfirmation(message);
    }

    accept.addEventListener('click', function () {
      finish('accepted', 'Your cookie preference has been saved.');
    });
    reject.addEventListener('click', function () {
      finish('rejected', 'Optional cookies rejected. Essential cookies remain active.');
    });

    actions.appendChild(accept);
    actions.appendChild(reject);
    banner.appendChild(top);
    banner.appendChild(description);
    banner.appendChild(note);
    banner.appendChild(actions);
    banner.appendChild(element('div', 'bng-cookie-footer', 'Your choice is saved on this device for 12 months.'));
    (document.body || document.documentElement).appendChild(banner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
