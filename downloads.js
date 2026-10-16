// LunarX download tracker — fixed (working API)
(function () {
  const PREFIX = 'https://lunarx.downloads/';

  function el(id) { return document.getElementById(id); }

  function format(n) {
    if (n === null || n === undefined || isNaN(n)) return '0 downloads';
    n = Number(n);
    return n.toLocaleString() + ' download' + (n === 1 ? '' : 's');
  }

  function parseCount(svgText) {
    // aria-label="12 / 12" or title>12 / 12
    var m = svgText.match(/aria-label="(\d+)\s*\/\s*(\d+)/i)
         || svgText.match(/title>(\d+)\s*\/\s*(\d+)/i)
         || svgText.match(/aria-label="(\d+)/i);
    if (!m) return null;
    // use the larger number (total)
    if (m[2]) return Math.max(parseInt(m[1], 10), parseInt(m[2], 10));
    return parseInt(m[1], 10);
  }

  async function bump(key) {
    try {
      var r = await fetch('https://hitscounter.dev/api/hit?url=' + encodeURIComponent(PREFIX + key), {
        cache: 'no-store',
        mode: 'cors'
      });
      var text = await r.text();
      return parseCount(text);
    } catch (e) {
      console.warn('counter error', e);
      return null;
    }
  }

  async function init() {
    var buttons = document.querySelectorAll('a[data-dl-key]');
    buttons.forEach(function (btn) {
      var key = btn.getAttribute('data-dl-key');
      var label = el('count-' + key);

      // show cached count immediately (if any)
      if (label) {
        var cached = localStorage.getItem('lx-dl-' + key);
        label.textContent = cached ? format(Number(cached)) : '0 downloads';
      }

      btn.addEventListener('click', async function () {
        var n = await bump(key);
        if (n === null) {
          // fallback: local +1 so UI still moves
          var cur = Number(localStorage.getItem('lx-dl-' + key) || 0) + 1;
          localStorage.setItem('lx-dl-' + key, String(cur));
          if (label) label.textContent = format(cur);
          return;
        }
        localStorage.setItem('lx-dl-' + key, String(n));
        if (label) label.textContent = format(n);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
