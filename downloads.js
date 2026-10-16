// LunarX download tracker (static site friendly)
(function () {
  const NS = 'lunarxsite';
  const API = 'https://api.counterapi.dev/v1';

  function el(id) { return document.getElementById(id); }

  async function getCount(key) {
    try {
      const r = await fetch(API + '/' + NS + '/' + key + '/', { cache: 'no-store' });
      if (!r.ok) return 0;
      const j = await r.json();
      return j.count || j.value || 0;
    } catch (e) {
      return null;
    }
  }

  async function bump(key) {
    try {
      const r = await fetch(API + '/' + NS + '/' + key + '/up', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j.count || j.value || null;
    } catch (e) {
      return null;
    }
  }

  function format(n) {
    if (n === null || n === undefined) return '—';
    return n.toLocaleString() + ' download' + (n === 1 ? '' : 's');
  }

  // data-dl-key on each download button, matching span id="count-KEY"
  async function init() {
    const buttons = document.querySelectorAll('a[data-dl-key]');
    for (const btn of buttons) {
      const key = btn.getAttribute('data-dl-key');
      const label = el('count-' + key);
      if (label) {
        const n = await getCount(key);
        label.textContent = format(n);
      }
      btn.addEventListener('click', async function () {
        const n = await bump(key);
        const label = el('count-' + key);
        if (label && n !== null) label.textContent = format(n);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
