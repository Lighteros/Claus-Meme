(() => {
 const root = document.documentElement;
 const experience = document.querySelector('.experience');
 const home = document.querySelector('#home');
 const notes = document.querySelector('#notes');
 const layout = notes.querySelector('.notes-layout');
 const readingStage = notes.querySelector('.layout-stage');
 const journal = document.querySelector('#journal-article');
 const hooks = document.querySelector('#hooks-article');
 const trackers = Object.fromEntries([
 ['burn', '/Hooks/Burn', 'Buyback & Burn | Claus', 'Buyback & Burn'],
 ['buybacks', '/Hooks/Buybacks', 'FOMO Buybacks | Claus', 'FOMO Buybacks'],
 ['liquidity', '/Hooks/Liquidity', 'Auto Liquidity | Claus', 'Auto Liquidity'],
 ['weather', '/Hooks/Weather', 'Weather Switch | Claus', 'Weather Switch'],
 ['funding', '/Hooks/Funding', 'Project Funding | Claus', 'Project Funding'],
 ['name', '/Hooks/Name', 'Token Identity | Claus', 'Token Identity']
 ].map(([view, path, title, label]) => [view, {path, title, label, article: document.getElementById(view + '-article')}]));
 const sectionSwitch = notes.querySelector('.section-switch');
 const brandLink = notes.querySelector('.brand-link');
 const scene = document.querySelector('#claus-scene');
 const form = document.querySelector('#claus-form');
 const mark = document.querySelector('#claus-mark');
 const status = document.querySelector('#ink-status');
 const ink = document.querySelector('#ink');
 const veil = document.querySelector('#ink-transition');
 const ctx = ink.getContext('2d');
 const cover = veil.getContext('2d');
 const fine = matchMedia('(hover: hover) and (pointer: fine)');
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const eyes = window.ClausEyes.create();
 let width = innerWidth, height = innerHeight;
 let pointer = { x: width *.65, y: height *.7 };
 let previous = null, pressed = null;
 let points = [], blooms = [];
 let strokeId = 0;
 let inverse = null, frame = 0, lastFrame = 0;
 let transition = null, queuedView = null;
 const informationPath = '/Home';
 const initialRoute = routeFromLocation();
 let view = initialRoute.view, activeJournalId = initialRoute.id;
 const trailLife = 920;
 const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
 const ease = t => t * t * t * (t * (t * 6 - 15) + 10);

 function setMetadata(meta, type = 'website') {
 if (!meta) return;
 document.title = meta.title;
 for (const [selector, value] of [
 ['meta[property="og:title"]', meta.title], ['meta[name="twitter:title"]', meta.title],
 ['meta[name="description"]', meta.description], ['meta[property="og:description"]', meta.description],
 ['meta[name="twitter:description"]', meta.description], ['meta[property="og:type"]', type]
 ]) document.querySelector(selector).content = value;
 }
 window.addEventListener('claus:journal-metadata', event => setMetadata(event.detail, 'article'));

 function routeFromLocation() {
 if (location.hash === '#notes') {
 history.replaceState({ claus: 'notes' }, '', informationPath + location.search);
 }
 const entry = location.pathname.match(/^\/Journal\/([^/]+)$/);
 if (entry) {
 try { return { view: 'journal', id: decodeURIComponent(entry[1]) }; } catch { return { view: 'journal', id: '' }; }
 }
 const tracker = Object.entries(trackers).find(([, item]) => item.path === location.pathname);
 if (tracker) return {view: tracker[0], id: null};
 if (location.pathname === '/Hooks') return {view: 'hooks', id: null};
 return { view: location.pathname === informationPath ? 'notes' : 'home', id: null };
 }

 function requestFrame() {
 if (!frame && !document.hidden) frame = requestAnimationFrame(render);
 }

 function clearTrail() {
 points = [];
 blooms = [];
 previous = null;
 ctx?.clearRect(0, 0, width, height);
 }

 function measure() {
 width = innerWidth;
 height = innerHeight;
 const dpr = Math.min(devicePixelRatio || 1, 2);
 for (const [canvas, context] of [[ink, ctx], [veil, cover]]) {
 canvas.width = Math.round(width * dpr);
 canvas.height = Math.round(height * dpr);
 context?.setTransform(dpr, 0, 0, dpr, 0, 0);
 }
 const narrow = width <= 700;
 const vbWidth = Math.max(narrow ? 400 : 1200, width / height * (narrow ? 480 : 560));
 scene.setAttribute('viewBox', `${narrow ? 60 : 0} 0 ${vbWidth} ${vbWidth * height / width}`);
 inverse = form.getScreenCTM()?.inverse() || null;
 clearTrail();
 requestFrame();
 }

 function swapView(next, id = null) {
 layout.dataset.panel = next === 'notes' && view === 'journal' ? 'journal' : 'about';
 view = next;
 activeJournalId = next === 'journal' ? id : null;
 if (next !== 'home' && !trackers[next]) notes.dataset.writing = 'pending';
 else delete notes.dataset.writing;
 if (next === 'journal') document.body.dataset.journalId = id;
 else delete document.body.dataset.journalId;
 home.hidden = next !== 'home';
 notes.hidden = next === 'home';
 layout.hidden = next !== 'notes';
 sectionSwitch.hidden = next !== 'notes';
 journal.hidden = next !== 'journal';
 hooks.hidden = next !== 'hooks';
 for (const [key, tracker] of Object.entries(trackers)) tracker.article.hidden = next !== key;
 const detail = next === 'journal' || next === 'hooks' || Boolean(trackers[next]);
 brandLink.href = detail ? informationPath : '/';
 brandLink.toggleAttribute('data-notes', detail);
 brandLink.toggleAttribute('data-home', !detail);
 notes.setAttribute('aria-label', next === 'journal' ? 'Claus journal' : next === 'hooks' ? 'Claus hooks' : trackers[next] ? trackers[next].label : 'About Claus');
 document.body.dataset.view = next;
 const canonical = 'https://claus.si' + (next === 'journal' ? '/Journal/' + encodeURIComponent(id) : next === 'hooks' ? '/Hooks' : trackers[next] ? trackers[next].path : next === 'notes' ? '/Home' : '/');
 document.querySelector('link[rel="canonical"]').href = canonical;
 document.querySelector('meta[property="og:url"]').content = canonical;
 document.querySelector('link[rel="alternate"][type="text/html"]').href = '/read' + (next === 'journal' ? '/Journal/' + encodeURIComponent(id) : next === 'hooks' ? '/Hooks' : trackers[next] ? trackers[next].path : '');
 const meta = window.ClausPageMetadata?.[new URL(canonical).pathname];
 if (meta) setMetadata(meta);
 else if (next === 'journal' && document.querySelector('meta[property="og:type"]').content !== 'article') setMetadata({title:'Journal | Claus',description:'Experiments and updates from Claus.'},'article');
 window.dispatchEvent(new Event('claus:view'));
 inverse = form.getScreenCTM()?.inverse() || null;
 clearTrail();
 }

 function focusView() {
 (view === 'journal' ? journal : view === 'hooks' ? hooks : trackers[view] ? trackers[view].article : view === 'notes' ? notes.querySelector(layout.dataset.panel === 'journal' ? '.claus-log' : '.note') : home).focus({ preventScroll: true });
 }

 // A closed chain of quadratic curves keeps every ink edge soft and rounded.
 function roundedShape(context, vertices) {
 const last = vertices[vertices.length - 1];
 const first = vertices[0];
 context.beginPath();
 context.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
 vertices.forEach((p, i) => {
 const next = vertices[(i + 1) % vertices.length];
 context.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
 });
 context.closePath();
 context.fill();
 }

 function blob(context, x, y, radius, rotation = 0) {
 const vertices = Array.from({ length: 16 }, (_, i) => {
 const a = i / 16 * Math.PI * 2;
 const r = radius * (1 +.075 * Math.sin(3 * a +.4) +.045 * Math.cos(5 * a -.6));
 return { x: x + Math.cos(a + rotation) * r, y: y + Math.sin(a + rotation) * r };
 });
 roundedShape(context, vertices);
 }

 function addPoint(x, y, now) {
 if (!previous || now - previous.time > 140) {
 strokeId++;
 previous = { x, y, time: now, radius: 3.6, stroke: strokeId };
 points.push(previous);
 return;
 }
 const dx = x - previous.x, dy = y - previous.y;
 const distance = Math.hypot(dx, dy);
 if (distance <.4) return;
 const targetRadius = clamp(3.4 + distance / Math.max(8, now - previous.time) * 1.2, 3.4, 7.2);
 previous = { x, y, time: now, radius: previous.radius *.55 + targetRadius *.45, stroke: strokeId };
 points.push(previous);
 if (points.length > 280) points.splice(0, points.length - 280);
 }

 // Interpolate the input path before giving it thickness, so fast gestures
 // stay curved instead of exposing straight segments between pointer events.
 function curveSamples(stroke) {
 const samples = [];
 const spline = (a, b, c, d, t) =>.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
 for (let i = 0; i < stroke.length - 1; i++) {
 const a = stroke[Math.max(0, i - 1)], b = stroke[i];
 const c = stroke[i + 1], d = stroke[Math.min(stroke.length - 1, i + 2)];
 const steps = Math.min(90, Math.max(2, Math.ceil(Math.hypot(c.x - b.x, c.y - b.y) / 3)));
 for (let n = 0; n < steps; n++) {
 const t = n / steps;
 samples.push({ x: spline(a.x, b.x, c.x, d.x, t), y: spline(a.y, b.y, c.y, d.y, t),
 radius: b.radius + (c.radius - b.radius) * t, time: b.time + (c.time - b.time) * t });
 }
 }
 samples.push(stroke[stroke.length - 1]);
 return samples;
 }

 function drawTrail(now) {
 if (!ctx) return;
 ctx.clearRect(0, 0, width, height);
 // Keep the spline's older neighbours until its visible tail has passed.
 // Removing every expired input point makes that tail jump between events.
 const firstVisible = points.findIndex(p => now - p.time < trailLife);
 points = firstVisible < 0 ? [] : points.slice(Math.max(0, firstVisible - 3));
 blooms = blooms.filter(p => now - p.time < 620);
 ctx.save();
 ctx.fillStyle = '#000000';
 const strokes = [];
 for (const point of points) {
 if (!strokes.length || strokes[strokes.length - 1][0].stroke !== point.stroke) strokes.push([]);
 strokes[strokes.length - 1].push(point);
 }
 for (const stroke of strokes) {
 if (stroke.length < 2) continue;
 const samples = curveSamples(stroke);
 const left = [], right = [];
 for (let i = 0; i < samples.length; i++) {
 const p = samples[i];
 const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
 const dx = b.x - a.x, dy = b.y - a.y;
 const length = Math.hypot(dx, dy) || 1;
 const age = clamp((now - p.time) / trailLife, 0, 1);
 const r = p.radius * (1 - ease(age));
 left.push({ x: p.x - dy / length * r, y: p.y + dx / length * r });
 right.push({ x: p.x + dy / length * r, y: p.y - dx / length * r });
 }
 roundedShape(ctx, [...left,...right.reverse()]);
 const head = samples[samples.length - 1];
 const r = head.radius * (1 - ease(clamp((now - head.time) / trailLife, 0, 1)));
 ctx.beginPath();
 ctx.arc(head.x, head.y, r, 0, Math.PI * 2);
 ctx.fill();
 }
 for (const p of blooms) {
 const age = (now - p.time) / 620;
 const size = age <.23 ? ease(age /.23) : Math.pow((1 - age) /.77,.7);
 blob(ctx, p.x, p.y, p.radius * size, p.rotation);
 }
 ctx.restore();
 }

 function updateEyes(delta) {
 return eyes.update(pointer, delta, reduced.matches);
 }

 function navigate(next, origin, push = true, id = null) {
 const route = routeFromLocation();
 if (push && (route.view !== next || next === 'journal' && route.id !== id)) {
 const path = next === 'journal' ? '/Journal/' + encodeURIComponent(id) : next === 'hooks' ? '/Hooks' : trackers[next] ? trackers[next].path : next === 'notes' ? informationPath : '/';
 history.pushState({ claus: next }, '', path + location.search);
 }
 if (transition) {
 if (!transition.swapped) { transition.next = next; transition.id = id; }
 else queuedView = { next, id };
 return;
 }
 if (view === next && (next !== 'journal' || activeJournalId === id)) return;
 if (reduced.matches || !cover) {
 swapView(next, id);
 focusView();
 window.dispatchEvent(new Event('claus:ready'));
 return;
 }
 const point = origin || { x: width *.5, y: height *.5 };
 const reading = view !== 'home' && next !== 'home';
 readingStage.getAnimations().forEach(animation => animation.cancel());
 transition = { next, id, reading, x: point.x / width, y: point.y / height, start: performance.now(), swapped: false };
 document.body.dataset.transition = 'cover';
 experience.inert = true;
 experience.setAttribute('aria-busy', 'true');
 veil.hidden = reading;
 veil.classList.toggle('is-active', !reading);
 clearTrail();
 requestFrame();
 }

 function finishTransition() {
 const reading = transition?.reading;
 const next = queuedView;
 queuedView = null;
 transition = null;
 cover?.clearRect(0, 0, width, height);
 veil.hidden = true;
 veil.classList.remove('is-active');
 experience.inert = false;
 experience.removeAttribute('aria-busy');
 delete document.body.dataset.transition;
 readingStage.style.removeProperty('opacity');
 if (reading && !reduced.matches) readingStage.animate([{opacity: 0}, {opacity: 1}], {duration: 230, easing: 'ease-out'});
 focusView();
 status.textContent = view === 'journal' ? 'Claus journal' : view === 'hooks' ? 'Claus hooks' : trackers[view] ? trackers[view].label : view === 'notes' ? 'About Claus' : 'Claus';
 window.dispatchEvent(new Event('claus:ready'));
 if (next && (next.next !== view || next.next === 'journal' && next.id !== activeJournalId)) navigate(next.next, null, false, next.id);
 }

 function drawTransition(now) {
 if (!transition || !cover) return;
 const elapsed = now - transition.start;
 if (transition.reading) {
 readingStage.style.opacity = String(1 - Math.min(1, elapsed / 140));
 if (elapsed < 140) return;
 if (!transition.swapped) {
 swapView(transition.next, transition.id);
 transition.swapped = true;
 }
 const loading = trackers[view] ? false : view === 'journal' ? journal.dataset.loading === 'true' : notes.dataset.contentReady !== 'true';
 if (!loading) finishTransition();
 return;
 }
 const fillTime = 420, holdTime = 0, revealTime = 480;
 const x = transition.x * width, y = transition.y * height;
 const farthest = Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y));
 const radius = farthest * 1.34 + 24;
 cover.clearRect(0, 0, width, height);
 cover.fillStyle = '#000000';
 if (elapsed < fillTime) {
 blob(cover, x, y, radius * ease(elapsed / fillTime));
 return;
 }
 if (!transition.swapped) {
 cover.fillRect(0, 0, width, height);
 swapView(transition.next, transition.id);
 transition.swapped = true;
 document.body.dataset.transition = 'covered';
 }
 if (elapsed < fillTime + holdTime) {
 cover.fillRect(0, 0, width, height);
 return;
 }
 const progress = clamp((elapsed - fillTime - holdTime) / revealTime, 0, 1);
 document.body.dataset.transition = 'reveal';
 blob(cover, x, y, radius * (1 - ease(progress)));
 if (progress >= 1) finishTransition();
 }

 function render(now) {
 frame = 0;
 const delta = clamp(now - (lastFrame || now - 16), 1, 40);
 lastFrame = now;
 const eyesMoving = updateEyes(delta);
 drawTrail(now);
 drawTransition(now);
 if (eyesMoving || points.length > 1 || blooms.length || transition) requestFrame();
 }

 document.addEventListener('pointermove', event => {
 pointer = { x: event.clientX, y: event.clientY };
 if (pressed && Math.hypot(pointer.x - pressed.x, pointer.y - pressed.y) > 12) pressed.dragged = true;
 if (transition) return;
 if (event.pointerType === 'mouse' && fine.matches && !reduced.matches && ctx) {
 const events = event.getCoalescedEvents?.() || [];
 for (const sample of events.length ? events : [event]) addPoint(sample.clientX, sample.clientY, performance.now());
 if (points.length > 1) root.classList.add('ink-pointer');
 }
 requestFrame();
 }, { passive: true });

 document.addEventListener('pointerdown', event => {
 pressed = { x: event.clientX, y: event.clientY, dragged: false };
 pointer = { x: event.clientX, y: event.clientY };
 if (event.pointerType !== 'mouse') root.classList.remove('ink-pointer');
 requestFrame();
 }, { passive: true });

 document.addEventListener('click', event => {
 if (transition) return;
 const entryLink = event.target.closest('a[data-journal-id]');
 const hooksLink = event.target.closest('a[data-hooks]');
 const trackerLink = event.target.closest('a[data-tracker]');
 const overviewLink = event.target.closest('[data-notes]');
 const homeLink = event.target.closest('[data-home]');
 if ((entryLink || hooksLink || trackerLink || overviewLink || homeLink) && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
 event.preventDefault();
 navigate(entryLink ? 'journal' : hooksLink ? 'hooks' : trackerLink ? trackerLink.dataset.tracker : overviewLink ? 'notes' : 'home', event.detail ? { x: event.clientX, y: event.clientY } : null, true, entryLink?.dataset.journalId || null);
 pressed = null;
 return;
 }
 if (event.target.closest('a, button, [data-copy-address]')) return;
 if (event.detail && pressed?.dragged) return;
 if (event.target.closest('[data-open-notes]') && view === 'home') {
 const r = form.getBoundingClientRect();
 navigate('notes', event.detail ? { x: event.clientX, y: event.clientY } : { x: r.left + r.width *.25, y: r.bottom - r.height *.2 });
 } else if (!reduced.matches && ctx) {
 blooms.push({ x: event.clientX, y: event.clientY, radius: 19, rotation:.4, time: performance.now() });
 if (blooms.length > 6) blooms.shift();
 requestFrame();
 }
 pressed = null;
 });

 document.addEventListener('selectstart', event => event.preventDefault());
 document.addEventListener('dragstart', event => event.preventDefault());

 form.addEventListener('keydown', event => {
 if (event.key === 'Enter' || event.key === ' ') {
 event.preventDefault();
 const r = form.getBoundingClientRect();
 navigate('notes', { x: r.left + r.width *.25, y: r.bottom - r.height *.2 });
 }
 });
 document.addEventListener('keydown', event => {
 root.classList.remove('ink-pointer');
 if (event.key === 'Escape') {
 if (trackers[view]) navigate('hooks');
 else if (view === 'journal' || view === 'hooks') navigate('notes');
 else if (view === 'notes') navigate('home');
 else clearTrail();
 }
 });
 document.addEventListener('pointerout', event => {
 if (!event.relatedTarget) { root.classList.remove('ink-pointer'); previous = null; }
 });
 window.addEventListener('blur', () => { root.classList.remove('ink-pointer'); clearTrail(); });
 document.addEventListener('visibilitychange', () => {
 if (document.hidden) { clearTrail(); cancelAnimationFrame(frame); frame = 0; }
 else { lastFrame = 0; requestFrame(); }
 });
 window.addEventListener('resize', measure, { passive: true });
 window.addEventListener('scroll', clearTrail, { passive: true });
 notes.addEventListener('scroll', () => { clearTrail(); requestFrame(); }, {passive: true});
 const historyChanged = () => { const route = routeFromLocation(); navigate(route.view, null, false, route.id); };
 window.addEventListener('popstate', historyChanged);
 window.addEventListener('hashchange', historyChanged);
 fine.addEventListener('change', () => { root.classList.remove('ink-pointer'); clearTrail(); });
 reduced.addEventListener('change', () => {
 root.classList.remove('ink-pointer');
 clearTrail();
 if (transition) { swapView(transition.next, transition.id); finishTransition(); }
 requestFrame();
 });

 swapView(view, activeJournalId);
 measure();
})();
