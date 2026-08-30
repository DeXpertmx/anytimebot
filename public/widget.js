/*!
 * Anytimebot embeddable widget
 *
 * Usage (inline):
 *   <div data-anytimebot="usuario/slug" data-height="680"></div>
 *   <script src="https://anytimebot.app/widget.js" async></script>
 *
 * Usage (floating button + popup):
 *   <div data-anytimebot="usuario/slug" data-mode="button" data-label="Agendar"></div>
 *   <script src="https://anytimebot.app/widget.js" async></script>
 *
 * Optional: set window.ANYTIMEBOT_URL to override the base URL
 * (defaults to the origin of the widget.js script itself).
 */
(function () {
  'use strict';

  if (window.__anytimebotWidgetLoaded) return;
  window.__anytimebotWidgetLoaded = true;

  var script = document.currentScript;
  var base = (
    window.ANYTIMEBOT_URL ||
    (script && script.src ? new URL(script.src).origin : 'https://anytimebot.app')
  ).replace(/\/+$/, '');

  function parseTarget(el) {
    var target = (el.getAttribute('data-anytimebot') || '').replace(/^\/+|\/+$/g, '');
    var parts = target.split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return {
      username: encodeURIComponent(parts[0]),
      slug: encodeURIComponent(parts.slice(1).join('/')),
    };
  }

  function embedUrl(target) {
    return base + '/embed/' + target.username + '/' + target.slug;
  }

  function createFrame(target, height) {
    var frame = document.createElement('iframe');
    frame.src = embedUrl(target);
    frame.title = 'Anytimebot';
    frame.loading = 'lazy';
    frame.style.width = '100%';
    frame.style.height = (parseInt(height, 10) || 680) + 'px';
    frame.style.border = '0';
    frame.style.borderRadius = '12px';
    frame.style.background = '#ffffff';
    frame.setAttribute('allow', 'payment');
    return frame;
  }

  function mountInline(el) {
    var target = parseTarget(el);
    if (!target) return;
    el.innerHTML = '';
    el.style.minHeight = (parseInt(el.getAttribute('data-height'), 10) || 680) + 'px';
    el.appendChild(createFrame(target, el.getAttribute('data-height')));
  }

  function mountButton(el) {
    var target = parseTarget(el);
    if (!target) return;

    var label = el.getAttribute('data-label') || 'Agendar';
    var color = el.getAttribute('data-color') || '#4f46e5';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('aria-label', label);
    btn.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:2147483000;display:inline-flex;' +
      'align-items:center;gap:8px;padding:12px 20px;border:0;border-radius:9999px;' +
      'background:' + color + ';color:#fff;font:600 15px/1 -apple-system,BlinkMacSystemFont,' +
      '"Segoe UI",Roboto,Helvetica,Arial,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.2);';

    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483001;background:rgba(15,23,42,.55);' +
      'display:none;align-items:center;justify-content:center;padding:16px;';

    var panel = document.createElement('div');
    panel.style.cssText =
      'position:relative;background:#fff;border-radius:16px;overflow:hidden;' +
      'width:100%;max-width:520px;height:min(90vh,720px);box-shadow:0 24px 64px rgba(0,0,0,.35);';

    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar');
    close.innerHTML = '&#10005;';
    close.style.cssText =
      'position:absolute;top:10px;right:10px;z-index:2;width:32px;height:32px;border:0;' +
      'border-radius:9999px;background:rgba(15,23,42,.08);color:#0f172a;font-size:14px;' +
      'line-height:1;cursor:pointer;';

    var frame = createFrame(target, '100%');
    frame.style.height = '100%';
    frame.style.borderRadius = '0';

    panel.appendChild(frame);
    panel.appendChild(close);
    overlay.appendChild(panel);

    function open() {
      overlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
    function closePanel() {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }

    btn.addEventListener('click', open);
    close.addEventListener('click', closePanel);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePanel();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.style.display === 'flex') closePanel();
    });

    el.appendChild(btn);
    document.body.appendChild(overlay);
  }

  function init() {
    var nodes = document.querySelectorAll('[data-anytimebot]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute('data-mode') === 'button') mountButton(el);
      else mountInline(el);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
