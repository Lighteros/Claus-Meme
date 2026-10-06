(() => {
  if (!document.getElementById('public-posts')) return;
  const account = 'ClausAgent';
  const sources = {
    posts: `https://x.com/${account}`,
    replies: `https://x.com/${account}/with_replies`
  };
  let widgets;
  const visible = () => !document.hidden && document.body.dataset.view === 'notes';
  const link = (text, href) => {
    const a = document.createElement('a');
    a.textContent = text;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  };
  function loadWidgets() {
    if (widgets) return widgets;
    widgets = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      const timeout = setTimeout(() => reject(Error('embed_timeout')), 12000);
      script.onload = () => {
        clearTimeout(timeout);
        if (window.twttr?.ready) window.twttr.ready(resolve);
        else reject(Error('embed_unavailable'));
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(Error('embed_unavailable'));
      };
      document.head.append(script);
    });
    return widgets;
  }
  async function mount(key) {
    const list = document.getElementById('public-' + key);
    const status = document.getElementById(key + '-status');
    const viewport = list.closest('.posts-window');
    const fallback = sources[key];
    if (list.dataset.mounted === 'true') return;
    try {
      const api = await loadWidgets();
      if (!list.isConnected) return;
      const height = Math.max(360, Math.floor(viewport.clientHeight || 480));
      const width = Math.max(250, Math.floor(viewport.clientWidth || 350));
      const rendered = await api.widgets.createTimeline(
        { sourceType: 'url', url: fallback },
        list,
        {
          theme: 'dark',
          dnt: true,
          chrome: 'nofooter noborders transparent',
          height,
          width
        }
      );
      if (!rendered) throw Error('embed_unavailable');
      list.dataset.mounted = 'true';
      status.hidden = true;
    } catch {
      status.replaceChildren(link(key === 'replies' ? 'View replies on X' : 'View posts on X', fallback));
      status.hidden = false;
    }
  }
  function refresh() {
    if (!visible()) return;
    mount('posts');
    mount('replies');
  }
  window.addEventListener('claus:view', refresh);
  document.addEventListener('visibilitychange', refresh);
  refresh();
})();
