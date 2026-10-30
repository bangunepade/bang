/* ES5-only graceful compatibility notice; does not replace modern security/auth requirements. */
(function () {
  function ready(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') { setTimeout(fn, 0); }
    else if (document.addEventListener) { document.addEventListener('DOMContentLoaded', fn, false); }
    else { window.attachEvent('onload', fn); }
  }
  function supportsModules() {
    var s = document.createElement('script');
    return 'noModule' in s;
  }
  function supportsFetch() { return typeof window.fetch === 'function'; }
  ready(function () {
    if (supportsModules() && supportsFetch()) { return; }
    var note = document.createElement('div');
    note.className = 'bng-legacy-notice';
    note.style.display = 'block';
    note.setAttribute('role', 'status');
    var strong = document.createElement('strong');
    strong.appendChild(document.createTextNode('Older browser compatibility mode'));
    var message = document.createElement('span');
    message.appendChild(document.createTextNode('This browser may display public pages, but sign-in, wallet actions, swaps, and other secure features may require a newer browser. For your safety, use a current browser for account access and financial actions.'));
    note.appendChild(strong);
    note.appendChild(message);
    if (document.body.firstChild) { document.body.insertBefore(note, document.body.firstChild); }
    else { document.body.appendChild(note); }
  });
}());
