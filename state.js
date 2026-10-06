(() => {
 const byId = id => document.getElementById(id);
 const dayFormat = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'});
 const refreshIntervalMs = 5000;
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const journalMotion = new Set();
 const copyTimers = new WeakMap();
 const inlineXTemplate = document.querySelector('.inline-x')?.cloneNode(true);
 let logRows = new Map();
 let snapshot = null, walletSnapshot = null, contractAddress = null, loading = false, refreshTimer = 0, nextRefreshAt = 0, failures = 0;

 function published() { window.dispatchEvent(new Event('claus:content')); }

 function publicLink(value) {
 try {
 const url = new URL(value);
 return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
 } catch { return null; }
 }

 function validate(value) {
 if (value?.schemaVersion !== 1 || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('Invalid snapshot');
 if (value.wallets) validateWallets(value.wallets);
 if (typeof value.token?.name !== 'string' || typeof value.token.ticker !== 'string') throw new Error('Invalid token');
 if (value.token.address !== null && !/^0x[0-9a-fA-F]{40}$/.test(value.token.address)) throw new Error('Invalid address');
 if (value.projectId != null && (typeof value.projectId !== 'string' || !/^[A-Za-z0-9_:.-]{1,160}$/.test(value.projectId))) throw new Error('Invalid project');
 if (contractAddress && value.token.address?.toLowerCase() !== contractAddress.toLowerCase() && (!value.projectId || value.projectId === snapshot?.projectId)) throw new Error('Contract changed');
 if (!Array.isArray(value.functions) || !value.functions.every(f => f && typeof f.name === 'string' && f.name.trim() && typeof f.description === 'string' && f.description.trim())) throw new Error('Invalid functions');
 if (!Array.isArray(value.logs) || !value.logs.every(log => log && typeof log.id === 'string' && /^[A-Za-z0-9_:.-]{1,160}$/.test(log.id) && typeof log.summary === 'string' && log.summary.trim() && Number.isFinite(Date.parse(log.at)))) throw new Error('Invalid log');
 if (new Set(value.logs.map(log => log.id)).size !== value.logs.length) throw new Error('Duplicate entries');
 if (!value.token.address && value.functions.length) throw new Error('Undeployed functions');
 if (value.hook?.implementation && !/^0x[0-9a-fA-F]{40}$/.test(value.hook.implementation)) throw new Error('Invalid implementation');
 return value;
 }

 function validateWallets(value) {
 const valid = address => /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/i.test(address);
 if (value?.schemaVersion !== 1 || value.activeAddress !== null && !valid(value.activeAddress) || value.treasuryAddress !== null && !valid(value.treasuryAddress)) throw new Error('Invalid wallets');
 if (value.activeAddress && value.activeAddress.toLowerCase() === value.treasuryAddress?.toLowerCase()) throw new Error('Wallets must be separate');
 return value;
 }

 function setCopyAddress(row, address, label) {
 row.hidden = !address;
 if (!address) return;
 row.dataset.address = address;
 row.dataset.copyLabel = label;
 const text = row.querySelector('.address-value');
 text.textContent = address.slice(0, 10) + '…' + address.slice(-8);
 row.title = 'Copy ' + label.toLowerCase() + ': ' + address;
 row.setAttribute('aria-label', row.title);
 }

 function renderWallets(wallets) {
 if (JSON.stringify(walletSnapshot) === JSON.stringify(wallets)) return;
 walletSnapshot = wallets;
 byId('active-wallet-section').hidden = !wallets.activeAddress;
 byId('treasury-wallet-section').hidden = !wallets.treasuryAddress;
 setCopyAddress(byId('active-wallet'), wallets.activeAddress, 'Wallet address');
 setCopyAddress(byId('treasury-wallet'), wallets.treasuryAddress, 'Treasury wallet address');
 byId('treasury-pending').hidden = !!wallets.treasuryAddress;
 }

 function headline(entry) {
 if (typeof entry.title === 'string' && entry.title.trim()) return entry.title.trim();
 const sentence = entry.summary.split(/[.!?](?=\s|$)/)[0];
 const clause = sentence.split(/,|\s+(?:with|while|without|from|to|after|before|against)\s+/i)[0];
 return clause.split(/\s+/).slice(0, 8).join(' ').replace(/\s+(?:and|or|a|the|in|on|of)$/i, '');
 }

 function settleJournal() {
 for (const animation of journalMotion) { animation.finish(); animation.cancel(); }
 journalMotion.clear();
 }

 function animateJournal(before, changed) {
 const frame = byId('journal-flow').parentElement.getBoundingClientRect();
 const visible = rect => rect.right > frame.left && rect.left < frame.right && rect.bottom > frame.top && rect.top < frame.bottom;
 let delay = 0;
 for (const {item} of logRows.values()) {
 const after = item.getBoundingClientRect(), previous = before.get(item);
 if (!visible(after) && (!previous || !visible(previous))) continue;
 let frames, options = {duration: 220, easing: 'cubic-bezier(.22, 1,.36, 1)'};
 if (changed.has(item)) {
 frames = [{opacity: 0, transform: 'translateY(-8px)'}, {opacity: 1, transform: 'translateY(0)'}];
 options = {...options, duration: 240, delay, fill: 'backwards'};
 delay = Math.min(delay + 30, 90);
 } else if (previous) {
 const x = previous.left - after.left, y = previous.top - after.top;
 if (Math.abs(x) <.5 && Math.abs(y) <.5) continue;
 // Fade across a page boundary; slide within the same reading column.
 frames = Math.abs(x) > 1 ? [
 {transform: `translate(${x}px, ${y}px)`, opacity: 1, offset: 0},
 {transform: `translate(${x}px, ${y + 32}px)`, opacity: 0, offset:.45},
 {transform: 'translate(0, 0)', opacity: 0, offset:.46},
 {transform: 'translate(0, 0)', opacity: 1, offset: 1}
 ] : [{transform: `translateY(${y}px)`}, {transform: 'translateY(0)'}];
 }
 if (!frames) continue;
 const animation = item.animate(frames, options);
 journalMotion.add(animation);
 animation.onfinish = () => journalMotion.delete(animation);
 }
 }

 function renderLogs() {
 const logs = [...snapshot.logs].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
 const list = byId('public-log');
 const nextRows = new Map(), changed = new Set();
 for (const [index, entry] of logs.entries()) {
 const key = String(entry.id || entry.at + '|' + entry.href + '|' + entry.summary);
 const content = JSON.stringify([entry.number, entry.at, entry.title, entry.summary, entry.href]);
 const row = logRows.get(key) || {item: document.createElement('li')};
 if (row.content !== content) {
 const title = document.createElement('h3');
 title.textContent = headline(entry);
 const time = document.createElement('time');
 time.dateTime = entry.at;
 time.textContent = dayFormat.format(new Date(entry.at));
 const summary = document.createElement('p');
 summary.textContent = entry.summary;
 const heading = document.createElement('a');
 heading.className = 'log-entry-heading journal-link';
 heading.href = '/Journal/' + encodeURIComponent(entry.id);
 heading.dataset.journalId = entry.id;
 heading.setAttribute('aria-label', `Journal #${entry.number}, ${dayFormat.format(new Date(entry.at))}: ${headline(entry)}`);
 if (Number.isSafeInteger(entry.number) && entry.number > 0) {
 const number = document.createElement('span');
 number.className = 'log-entry-number';
 number.textContent = '#' + entry.number;
 heading.append(number);
 }
 heading.append(time, title);
 row.item.replaceChildren(heading, summary);
 row.item.dataset.entryId = key;
 row.content = content;
 changed.add(row.item);
 }
 if (list.children[index] !== row.item) list.insertBefore(row.item, list.children[index] || null);
 nextRows.set(key, row);
 }
 for (const [key, row] of logRows) if (!nextRows.has(key)) row.item.remove();
 logRows = nextRows;
 list.hidden = !logs.length;
 return changed;
 }

 function renderToken() {
 const {token} = snapshot;
 byId('token-section').hidden = false;
 const notice = snapshot.copy?.tokenNotice;
 byId('token-name').hidden = !!notice || !token.address;
 byId('token-ticker').hidden = !!notice || !token.address;
 byId('token-pending').textContent = notice || 'Real token not live yet';
 byId('token-name').textContent = token.name;
 byId('token-name').title = token.name;
 byId('token-ticker').textContent = '$' + token.ticker;
 byId('token-ticker').title = '$' + token.ticker;
 byId('name-current').textContent = token.name;
 byId('name-ticker').textContent = '$' + token.ticker;
 const nameContract = byId('name-contract');
 if (nameContract) {
 nameContract.removeAttribute('href');
 nameContract.textContent = '';
 }
 const tokenAnchor = nameContract?.closest('.token-anchor');
 if (tokenAnchor) tokenAnchor.hidden = true;
 byId('name-status').hidden = true;
 contractAddress = token.address;
 const address = byId('token-address');
 address.hidden = true;
 byId('token-pending').hidden = !!contractAddress && !notice;
 byId('copy-address').hidden = true;
 setCopyAddress(byId('token-contract'), null, 'Contract address');
 const homeCa = byId('home-ca');
 if (homeCa) homeCa.hidden = true;
 }

 function renderFunctions() {
 const functions = snapshot.functions;
 byId('functions-section').hidden = false;
 function itemFor(feature, preview = false) {
 const item = document.createElement('li');
 const title = document.createElement(preview ? 'h3' : 'h2');
 const detail = {'https://claus.si/Hooks/Burn':'burn', 'https://claus.si/Hooks/Buybacks':'buybacks', 'https://claus.si/Hooks/Liquidity':'liquidity', 'https://claus.si/Hooks/Weather':'weather', 'https://claus.si/Hooks/Funding':'funding', 'https://claus.si/Hooks/Name':'name'}[feature.href];
 const standalone = ['https://claus.si/Hooks/Arena', 'https://claus.si/Hooks/NFTs'].includes(feature.href);
 const source = detail || standalone ? new URL(feature.href).pathname : preview ? '/Hooks' : publicLink(feature.href);
 if (source) {
 const a = document.createElement('a');
 a.className = 'feature-source';
 a.textContent = feature.name;
 a.href = source;
 if (detail) a.dataset.tracker = detail;
 else if (standalone) { /* Game and NFT pages keep normal navigation. */ }
 else if (preview) a.dataset.hooks = '';
 else {
 a.target = '_blank';
 a.rel = 'noopener noreferrer';
 a.setAttribute('aria-label', feature.name + ' source');
 }
 title.append(a);
 } else title.textContent = feature.name;
 item.append(title);
 if (!preview) {
 const description = document.createElement('p');
 description.textContent = feature.description;
 item.append(description);
 }
 return item;
 }
 byId('active-functions').replaceChildren(...functions.map(feature => itemFor(feature, true)));
 byId('all-hooks').replaceChildren(...functions.map(feature => itemFor(feature)));
 for (const id of ['active-functions', 'all-hooks']) byId(id).hidden = !functions.length;
 for (const id of ['hooks-total']) {
 byId(id).textContent = String(functions.length);
 byId(id).setAttribute('aria-label', `${functions.length} listed capabilities`);
 }
 byId('hooks-intro').hidden = !snapshot.functions.length || !snapshot.copy?.hooksIntro;
 byId('hooks-total').hidden = false;
 byId('hooks-feed-error').hidden = true;
 byId('hooks-article').dataset.loading = 'false';
 }

 function renderCopy(copy) {
 if (!copy) return;
 const targets = {tokenLabel:'token-heading', activeLabel:'active-wallet-heading', treasuryLabel:'treasury-wallet-heading', hooksLabel:'active-hooks-label', allHooksLabel:'all-hooks-label', journalLabel:'log-heading', hooksTitle:'hooks-title-label', hooksIntro:'hooks-intro', structureTitle:'hook-structure-heading', structureBefore:'hook-structure-before', structureCaption:'hook-structure-caption', structureAfter:'hook-structure-after'};
 for (const [key,id] of Object.entries(targets)) {
 const element=byId(id);
 if (element && typeof copy[key] === 'string' && element.textContent !== copy[key]) element.textContent=copy[key];
 }
 if (byId('entry-journal-label').textContent !== copy.journalLabel) byId('entry-journal-label').textContent=copy.journalLabel;
 const story=document.querySelector('.claus-about.claus-story');
 if (!Array.isArray(copy.intro) || copy.intro.some(p=>typeof p !== 'string')) return;
 if (story.children.length===copy.intro.length && [...story.children].every((p,i)=>p.textContent===copy.intro[i].replaceAll('{x}',''))) return;
 const x=inlineXTemplate;
 const paragraphs=copy.intro.map((text,index)=>{
 const p=document.createElement('p');p.className=index?'note-detail':'note';
 if (!index) p.tabIndex=-1;
 text.split('{x}').forEach((part,i)=>{if(i&&x)p.append(x.cloneNode(true));p.append(document.createTextNode(part));});
 return p;
 });
 story.replaceChildren(...paragraphs);
 }

 function render(previous) {
 const differs = field => !previous || JSON.stringify(previous[field]) !== JSON.stringify(snapshot[field]);
 const tokenChanged = differs('token'), functionsChanged = differs('functions'), logsChanged = differs('logs');
 const copyChanged=differs('copy'), walletsChanged=differs('wallets');
 if (!tokenChanged && !functionsChanged && !logsChanged && !copyChanged && !walletsChanged) return;
 settleJournal();
 const journalLive = !!previous && logsChanged && !document.body.dataset.transition &&
 byId('notes').dataset.writing !== 'pending';
 const motion = journalLive && !reduced.matches && !document.hidden && document.body.dataset.view === 'notes' &&
 !!byId('journal-flow').getClientRects().length;
 const before = motion ? new Map([...logRows.values()].map(({item}) => [item, item.getBoundingClientRect()])) : null;
 if (copyChanged) renderCopy(snapshot.copy);
 if (walletsChanged && snapshot.wallets) renderWallets(snapshot.wallets);
 if (tokenChanged || copyChanged) renderToken();
 if (functionsChanged) renderFunctions();
 const changed = logsChanged ? renderLogs() : null;
 // Update reading-page geometry before measuring destinations, in the same paint.
 byId('notes').dataset.contentReady = 'true';
 published();
 if (motion) animateJournal(before, changed);
 }

 function scheduleRefresh() {
 clearTimeout(refreshTimer);
 if (['home', 'burn', 'buybacks', 'liquidity', 'weather'].includes(document.body.dataset.view) || document.hidden || loading) return;
 refreshTimer = setTimeout(refresh, Math.max(0, nextRefreshAt - Date.now()));
 }

 async function refresh() {
 if (['home', 'burn', 'buybacks', 'liquidity', 'weather'].includes(document.body.dataset.view) || document.hidden || loading) return;
 loading = true;
 let receivedState = false;
 try {
 const load = async path => {
 const response = await fetch(path, {cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000)});
 if (!response.ok) throw new Error('Unavailable');
 return response.json();
 };
 const [state, wallets] = await Promise.allSettled([
 load('/state.json').then(validate), snapshot?.wallets ? Promise.resolve(null) : load('/wallets.json').then(validateWallets)
 ]);
 if (state.status === 'fulfilled') {
 receivedState = true;
 const next = state.value;
 if (!snapshot || JSON.stringify(next) !== JSON.stringify(snapshot)) {
 const previous = snapshot;
 snapshot = next;
 render(previous);
 }
 window.dispatchEvent(new CustomEvent('claus:feed', {detail: {revision: next.revision || next.updatedAt}}));
 } else if (!snapshot) {
 byId('notes').dataset.contentReady = 'true';
 byId('hooks-article').dataset.loading = 'false';
 byId('hooks-total').hidden = true;
 byId('hooks-feed-error').hidden = false;
 byId('name-status').textContent = 'Token details unavailable · retrying';
 published();
 }
 if (!snapshot?.wallets && wallets.status === 'fulfilled' && wallets.value) { renderWallets(wallets.value); published(); }
 } catch {
 // Keep the last published content and retry on the next refresh.
 } finally {
 failures = receivedState ? 0 : Math.min(failures + 1, 4);
 nextRefreshAt = Date.now() + (receivedState ? refreshIntervalMs : Math.min(5000 * 2 ** (failures - 1), 30000));
 loading = false;
 scheduleRefresh();
 }
 }

 for (const row of document.querySelectorAll('[data-copy-address]')) row.addEventListener('click', async () => {
 const address = row.dataset.address, label = row.dataset.copyLabel;
 if (!address) return;
 try {
 await navigator.clipboard.writeText(address);
 const icon = row.querySelector('.copy-address');
 clearTimeout(copyTimers.get(row));
 icon.classList.add('is-copied');
 row.setAttribute('aria-label', label + ' copied');
 copyTimers.set(row, setTimeout(() => {
 icon.classList.remove('is-copied');
 row.setAttribute('aria-label', 'Copy ' + label.toLowerCase() + ': ' + row.dataset.address);
 }, 1900));
 byId('ink-status').textContent = label + ' copied';
 } catch { byId('ink-status').textContent = 'Unable to copy ' + label.toLowerCase(); }
 });
 window.addEventListener('resize', settleJournal);
 window.addEventListener('claus:view', () => { settleJournal(); scheduleRefresh(); });
 document.addEventListener('visibilitychange', () => {
 settleJournal();
 if (!document.hidden) nextRefreshAt = 0;
 scheduleRefresh();
 });
 reduced.addEventListener('change', settleJournal);
 byId('notes').addEventListener('click', event => {
 if (event.target.closest('.page-controls,.section-switch')) settleJournal();
 }, {capture: true});
 byId('notes').addEventListener('keydown', event => {
 if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') settleJournal();
 }, {capture: true});
 try {
 const initial = document.getElementById('public-edition');
 if (initial) {
 snapshot = validate(JSON.parse(initial.textContent));
 render(null);
 nextRefreshAt = Date.now() + refreshIntervalMs;
 }
 } catch { /* Retry through the public endpoint below. */ }
 scheduleRefresh();
})();
