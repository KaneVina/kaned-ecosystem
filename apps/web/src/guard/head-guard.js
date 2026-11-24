/*
 * Kaned's developer-tools guard. Vite puts this, with the disable-devtool library before it, inline at
 * the very top of <head> (vite.config.ts), so it runs before the app and everything the app registers.
 *
 * - While the developer tools are open, the page's content is removed from the DOM (not just hidden, so
 *   the Elements panel has nothing to read) and replaced by a short message; the console is cleared
 *   over and over.
 * - When they close, the page reloads and works as usual. "Leave site?" prompts the app adds later are
 *   switched off first, so the reload never stops to ask.
 * - The usual ways in are closed: F12, Ctrl/Cmd+Shift+I/J/C/K, Cmd+Opt+I/J/C/U, Ctrl+U, and the
 *   right-click menu (except in text fields, so paste still works).
 *
 * Skipped on localhost, for admins (the app sets kaned.staff), and when VITE_DEVTOOLS_GUARD=off.
 * localStorage kaned.guard = "on" forces it on (for testing on localhost).
 * This is a deterrent, not security: the server never trusts the browser.
 */
(function () {
  var ls = function (k) {
    try {
      return window.localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  var forced = ls('kaned.guard') === 'on';
  var off = '__GUARD_SETTING__' === 'off';
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (!forced && (off || local || ls('kaned.staff') === '1')) return;
  if (window.top !== window.self) return;

  var tripped = false;

  /* "Leave site?" prompts registered later go quiet once the guard has tripped. */
  var add = window.addEventListener;
  var rem = window.removeEventListener;
  var wraps = typeof WeakMap === 'function' ? new WeakMap() : null;
  if (wraps) {
    window.addEventListener = function (type, fn, opts) {
      if (type === 'beforeunload' && typeof fn === 'function') {
        var w = wraps.get(fn);
        if (!w) {
          w = function (e) {
            if (!tripped) return fn.call(this, e);
          };
          wraps.set(fn, w);
        }
        return add.call(window, type, w, opts);
      }
      return add.call(window, type, fn, opts);
    };
    window.removeEventListener = function (type, fn, opts) {
      if (type === 'beforeunload' && wraps.has(fn)) return rem.call(window, type, wraps.get(fn), opts);
      return rem.call(window, type, fn, opts);
    };
  }
  try {
    var own = null;
    Object.defineProperty(window, 'onbeforeunload', {
      configurable: true,
      get: function () {
        return own;
      },
      set: function (f) {
        own = typeof f === 'function' ? f : null;
      },
    });
    add.call(window, 'beforeunload', function (e) {
      if (!tripped && own) return own.call(window, e);
    });
  } catch (e) {}

  /* Shortcuts and the right-click menu. */
  add.call(
    window,
    'keydown',
    function (e) {
      var c = e.code || '';
      var k = (e.key || '').toLowerCase();
      var mod = e.ctrlKey || e.metaKey;
      var hit =
        c === 'F12' ||
        k === 'f12' ||
        (mod && e.shiftKey && /^(KeyI|KeyJ|KeyC|KeyK)$/.test(c)) ||
        (e.metaKey && e.altKey && /^(KeyI|KeyJ|KeyC|KeyU)$/.test(c)) ||
        (e.ctrlKey && !e.shiftKey && !e.altKey && c === 'KeyU') ||
        (e.metaKey && e.altKey && c === 'KeyU');
      if (hit) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  add.call(
    window,
    'contextmenu',
    function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')) return;
      e.preventDefault();
    },
    true,
  );

  /* What the page becomes while the tools are open. */
  var MESSAGE =
    '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kaned</title>' +
    '<style>html,body{margin:0;height:100%;background:#F5F7FB;color:#121826;font-family:"Be Vietnam Pro","Segoe UI",system-ui,-apple-system,sans-serif;-webkit-user-select:none;user-select:none}' +
    'main{min-height:100%;display:grid;place-content:center;gap:14px;text-align:center;padding:32px;box-sizing:border-box}' +
    '.k{font:800 22px/1 Syne,"Arial Black",sans-serif;letter-spacing:.04em;color:#2448D8}' +
    'h1{margin:6px 0 0;font-size:clamp(26px,5vw,44px);line-height:1.2;letter-spacing:-.01em}' +
    'p{margin:0;max-width:44ch;color:#687184;font-size:16px;line-height:1.6;justify-self:center}</style></head>' +
    '<body><main><div class="k">KANED</div><h1>Ối zời ơi, ai sao lưng kìa…</h1>' +
    '<p>Đóng công cụ nhà phát triển (DevTools) là trang tự mở lại để bạn học tiếp.</p></main></body></html>';

  function wipe() {
    try {
      window.stop();
    } catch (e) {}
    try {
      document.open();
      document.write(MESSAGE);
      document.close();
    } catch (e) {
      document.documentElement.innerHTML = MESSAGE.replace(/^<!doctype html><html[^>]*>|<\/html>$/g, '');
    }
  }

  function trip() {
    if (tripped) return;
    tripped = true;
    if (document.readyState === 'loading') {
      // Still in <head>: stop the rest of the page (and the app) from loading at all.
      wipe();
    } else {
      wipe();
    }
  }

  if (typeof window.DisableDevtool !== 'function') return;
  window.DisableDevtool({
    ondevtoolopen: trip,
    ondevtoolclose: function () {
      if (tripped) location.reload();
    },
    interval: 400,
    clearLog: true,
    disableMenu: false,
    clearIntervalWhenDevOpenTrigger: false,
    disableSelect: false,
    disableInputSelect: false,
    disableCopy: false,
    disableCut: false,
    disablePaste: false,
    disableIframeParents: false,
    seo: true,
  });
})();
