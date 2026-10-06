(() => {
 const article = document.getElementById('journal-article');
 const title = document.getElementById('journal-entry-title');
 const date = document.getElementById('journal-entry-date');
 const number = document.getElementById('journal-entry-number');
 const body = document.getElementById('journal-entry-body');
 const source = document.getElementById('journal-entry-source');
 const dayFormat = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'});
 const cache = new Map();
 const pending = new Map();
 try {
 const initial = JSON.parse(document.getElementById('journal-data')?.textContent || 'null');
 if (initial?.id) cache.set(initial.id, {entry: initial, revision: null});
 } catch { /* The public endpoint remains the fallback. */ }
 const previous = document.getElementById('journal-previous');
 const next = document.getElementById('journal-next');
 let currentId = null, controller = null, displayed = null, revision = null;

 function updateNavigation() {
 const entries = [...document.querySelectorAll('#public-log.log-entry-heading')].map(link => ({
 id: link.dataset.journalId,
 number: Number(link.querySelector('.log-entry-number')?.textContent.replace('#', '')),
 title: link.querySelector('h3')?.textContent || ''
 })).filter(entry => entry.id && Number.isSafeInteger(entry.number)).sort((a, b) => a.number - b.number);
 const index = entries.findIndex(entry => entry.id === document.body.dataset.journalId);
 for (const [link, entry] of [[previous, index > 0 ? entries[index - 1] : null], [next, index >= 0 ? entries[index + 1] : null]]) {
 link.setAttribute('aria-disabled', String(!entry));
 link.tabIndex = entry ? 0 : -1;
 if (entry) {
 link.href = '/Journal/' + encodeURIComponent(entry.id);
 link.dataset.journalId = entry.id;
 link.title = `Journal #${entry.number}: ${entry.title}`;
 link.setAttribute('aria-label', `${link === previous ? 'Previous' : 'Next'} journal: #${entry.number}, ${entry.title}`);
 } else {
 link.removeAttribute('href');
 link.removeAttribute('data-journal-id');
 link.removeAttribute('title');
 link.setAttribute('aria-label', link === previous ? 'Previous journal' : 'Next journal');
 }
 }
 }

 function active(id) {
 return document.body.dataset.view === 'journal' && document.body.dataset.journalId === id;
 }

 function render(entry) {
 if (!active(entry.id)) return;
 const content = JSON.stringify(entry);
 article.dataset.loading = 'false';
 article.removeAttribute('aria-busy');
 if (displayed === content) return;
 displayed = content;
 title.textContent = entry.title?.trim() || entry.summary.split(/[.!?](?=\s|$)/)[0];
 const numbered = Number.isSafeInteger(entry.number) && entry.number > 0;
 number.hidden = !numbered;
 number.textContent = numbered ? '#' + entry.number : '';
 date.dateTime = entry.at;
 date.textContent = dayFormat.format(new Date(entry.at));
 const paragraphs = entry.body.trim().split(/\n\s*\n/).map((text, index) => {
 const paragraph = document.createElement('p');
 paragraph.className = index ? 'note-detail' : 'note';
 paragraph.textContent = text;
 return paragraph;
 });
 body.replaceChildren(...paragraphs);
 source.replaceChildren();
 source.hidden = true;
 try {
 const url = new URL(entry.href);
 if (url.protocol === 'https:' && !url.username && !url.password) {
 const link = document.createElement('a');
 link.href = url.href;
 const ownHook = url.origin === 'https://claus.si' && url.pathname.startsWith('/Hooks/');
 link.textContent = ownHook ? (url.pathname === '/Hooks/Arena' ? 'Play Rising Tide' : 'View hook') : url.hostname === 'robinhoodchain.blockscout.com' && url.pathname.startsWith('/tx/') ? 'View transaction' : url.hostname === 'opensea.io' && url.pathname.startsWith('/assets/') ? 'View NFT' : 'View source';
 if (ownHook) link.href = url.pathname;
 else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
 source.append(link);
 source.hidden = false;
 }
 } catch { /* A source is optional. */ }
 if(entry.onchain?.chainId===1 && entry.onchain.protocol==='claus-journal/1' && /^0x[0-9a-f]{64}$/i.test(entry.onchain.transactionHash)) {
 const link=document.createElement('a');
 link.href='https://robinhoodchain.blockscout.com/tx/'+entry.onchain.transactionHash;
 link.textContent='Onchain record';link.target='_blank';link.rel='noopener noreferrer';
 source.append(link);source.hidden=false;
 }
 const current = document.createElement('a');
 current.href = '/Hooks';
 current.dataset.hooks = '';
 current.textContent = 'Current hooks';
 source.append(current);
 source.hidden = false;
 window.dispatchEvent(new CustomEvent('claus:journal-metadata', {detail:{title:title.textContent+' | Claus Journal',description:entry.summary}}));
 window.dispatchEvent(new Event('claus:content'));
 // Only the two adjacent articles are warmed, never the whole archive.
 for (const link of [previous, next]) {
 const id = link.dataset.journalId;
 if (id && cache.get(id)?.revision !== revision) requestEntry(id, revision).catch(() => {});
 }
 }

 function requestEntry(id, requestRevision) {
 const key = `${requestRevision}:${id}`;
 if (pending.has(key)) return pending.get(key);
 const promise = (async () => {
 if (!/^[A-Za-z0-9_:.-]{1,160}$/.test(id)) throw new Error('Invalid entry');
 const response = await fetch('/journal/' + encodeURIComponent(id) + '.json', {
 cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000)
 });
 if (!response.ok) throw new Error('Unavailable');
 const entry = await response.json();
 if (entry.id !== id || typeof entry.summary !== 'string' || typeof entry.body !== 'string' || !entry.body.trim() || entry.body.length > 24000 || !Number.isFinite(Date.parse(entry.at)) || entry.title !== undefined && typeof entry.title !== 'string') throw new Error('Invalid entry');
 if (requestRevision === revision) {
 cache.set(id, {entry, revision: requestRevision});
 if (cache.size > 20) cache.delete(cache.keys().next().value);
 }
 return entry;
 })().finally(() => pending.delete(key));
 pending.set(key, promise);
 return promise;
 }

 async function load() {
 updateNavigation();
 const id = document.body.dataset.journalId;
 if (!active(id)) {
 controller?.abort();
 controller = null;
 currentId = null;
 return;
 }
 if (currentId !== id) {
 controller?.abort();
 controller = null;
 currentId = id;
 displayed = null;
 title.textContent = '';
 date.textContent = '';
 number.textContent = '';
 number.hidden = true;
 body.replaceChildren();
 source.hidden = true;
 article.querySelector('.page-window').scrollTop = 0;
 article.dataset.loading = 'true';
 article.setAttribute('aria-busy', 'true');
 }
 const cached = cache.get(id);
 if (cached) render(cached.entry);
 if (controller || cached && cached.revision === revision) return;
 const requestRevision = revision;
 const request = new AbortController();
 controller = request;
 try {
 const entry = await requestEntry(id, requestRevision);
 if (request.signal.aborted) return;
 render(entry);
 } catch {
 if (!request.signal.aborted && active(id) && !cache.has(id)) {
 article.dataset.loading = 'false';
 article.removeAttribute('aria-busy');
 title.textContent = 'This entry could not load.';
 const retry = document.createElement('button');
 retry.className = 'text-link';
 retry.textContent = 'Try again';
 retry.addEventListener('click', () => { currentId = null; load(); });
 body.replaceChildren(retry);
 document.title = 'Journal';
 window.dispatchEvent(new Event('claus:content'));
 }
 } finally {
 if (controller === request) controller = null;
 }
 }

 window.addEventListener('claus:view', () => load());
 window.addEventListener('claus:feed', event => {
 const nextRevision = event.detail?.revision;
 if (nextRevision && nextRevision !== revision) {
 revision = nextRevision;
 controller?.abort();
 controller = null;
 }
 load();
 });
 article.addEventListener('keydown', event => {
 const link = event.key === 'ArrowLeft' ? previous : event.key === 'ArrowRight' ? next : null;
 if (link && link.getAttribute('aria-disabled') === 'false') { event.preventDefault(); link.click(); }
 });
 load();
})();
