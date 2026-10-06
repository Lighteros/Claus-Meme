(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const integer = new Intl.NumberFormat('en-US');
  function format(value, decimals = 0) {
    const scale = 10n ** BigInt(decimals);
    return integer.format(value / scale) + (decimals ? '.' + (value % scale).toString().padStart(decimals, '0') : '');
  }
  window.ClausCounter = function ({view, endpoint, validate, metrics, show}) {
    const article = document.getElementById(view + '-article');
    const status = document.getElementById(view + '-status');
    const announced = document.getElementById(view + '-announcement');
    const counters = metrics.map(m => ({...m, element: document.getElementById(m.id), displayed: 0n, target: 0n}));
    let snapshot = null, frame = 0, timer = 0, request = null, receivedAt = 0;
    const visible = () => document.body.dataset.view === view && !document.hidden;
    const paint = (m, value) => {
      const text = format(value, m.decimals);
      if (m.element.textContent !== text) m.element.textContent = text;
      m.displayed = value;
    };
    function animate(data) {
      cancelAnimationFrame(frame);
      for (const m of counters) { m.from = m.displayed; m.target = BigInt(m.value(data)) / (10n ** BigInt(18 - (m.decimals || 0))); }
      if (reduced.matches || !visible() || counters.every(m => m.displayed === m.target)) { counters.forEach(m => paint(m, m.target)); return; }
      const start = performance.now();
      const tick = now => {
        const progress = Math.min(1, (now - start) / 1500);
        const weight = BigInt(Math.round((1 - (1 - progress) ** 3) * 1000000));
        counters.forEach(m => paint(m, m.from + (m.target - m.from) * weight / 1000000n));
        if (progress < 1) frame = requestAnimationFrame(tick);
        else { frame = 0; counters.forEach(m => paint(m, m.target)); }
      };
      frame = requestAnimationFrame(tick);
    }
    function display(data) {
      announced.textContent = show(data);
      status.textContent = ''; status.hidden = true; status.dataset.state = 'live';
      status.title = 'Ethereum block ' + integer.format(data.blockNumber);
      article.removeAttribute('aria-busy'); animate(data);
    }
    async function refresh() {
      clearTimeout(timer);
      if (!visible() || request) return;
      const controller = new AbortController(); request = controller;
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(endpoint, {signal: controller.signal, cache: 'no-cache'});
        if (!response.ok) throw Error('Unavailable');
        const data = validate(await response.json());
        if (!Number.isSafeInteger(data.blockNumber) || !Number.isFinite(Date.parse(data.observedAt)) || Date.now() - Date.parse(data.observedAt) > 300000) throw Error('Invalid snapshot');
        for (const m of counters) if (!/^\d+$/.test(m.value(data))) throw Error('Invalid amount');
        if (!visible() || request !== controller) return;
        if (snapshot && data.blockNumber < snapshot.blockNumber) throw Error('Older snapshot');
        snapshot = data; receivedAt = Date.now(); display(data);
      } catch {
        if (visible() && request === controller) {
          status.textContent = snapshot ? 'Last confirmed total · retrying' : 'Temporarily unavailable · retrying';
          status.hidden = false; status.dataset.state = 'delayed'; article.removeAttribute('aria-busy');
        }
      } finally {
        clearTimeout(timeout);
        if (request === controller) { request = null; if (visible()) timer = setTimeout(refresh, 120000); }
      }
    }
    function resume() {
      clearTimeout(timer);
      if (!visible()) {
        request?.abort(); request = null; cancelAnimationFrame(frame); frame = 0;
        if (snapshot) counters.forEach(m => paint(m, m.target)); return;
      }
      if (!snapshot) article.setAttribute('aria-busy', 'true');
      const remaining = 120000 - (Date.now() - receivedAt);
      if (snapshot && remaining > 0) { display(snapshot); timer = setTimeout(refresh, remaining); }
      else refresh();
    }
    window.addEventListener('claus:view', resume);
    document.addEventListener('visibilitychange', resume);
    reduced.addEventListener('change', () => { if (reduced.matches) { cancelAnimationFrame(frame); frame = 0; if (snapshot) counters.forEach(m => paint(m, m.target)); } });
    resume();
  };
})();
