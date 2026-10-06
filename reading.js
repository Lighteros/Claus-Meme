(() => {
 const notes = document.getElementById('notes');
 const layout = notes.querySelector('.notes-layout');
 const shell = notes.querySelector('.notes-shell');
 const journal = document.getElementById('journal-article');
 const hooks = document.getElementById('hooks-article');
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const compact = matchMedia('(max-width: 850px)');
 const panels = [...notes.querySelectorAll('.reading-panel')].map(element => ({
 element, window: element.querySelector('.page-window'), flow: element.querySelector('.page-flow'),
 controls: element.querySelector('.page-controls'), previous: element.querySelector('.page-prev'),
 next: element.querySelector('.page-next'), page: 0, count: 1
 }));
 let measureFrame = 0;

 // Animate real column widths, not a frozen copy of the previous page.
 function fitShell() {
 if (document.body.dataset.view === 'home') return;
 const style = getComputedStyle(notes);
 const available = notes.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
 shell.style.width = Math.min(available, ['journal', 'hooks', 'burn', 'buybacks', 'liquidity', 'weather', 'funding', 'name'].includes(document.body.dataset.view) ? 760 : compact.matches ? 560 : 1440) + 'px';
 }

 function intersects(rect, frame) {
 return rect.right > frame.left +.5 && rect.left < frame.right -.5 && rect.bottom > frame.top && rect.top < frame.bottom;
 }

 function position(panel) {
 if (!panel.controls) return;
 if (compact.matches) {
 panel.page = 0;
 panel.flow.style.removeProperty('transform');
 panel.controls.dataset.single = 'true';
 for (const element of panel.flow.querySelectorAll('a, button')) element.removeAttribute('tabindex');
 return;
 }
 panel.page = Math.max(0, Math.min(panel.page, panel.count - 1));
 panel.flow.style.transform = `translateX(${-panel.page * panel.stride}px)`;
 panel.previous.disabled = panel.turning || panel.page === 0;
 panel.next.disabled = panel.turning || panel.page === panel.count - 1;
 panel.controls.dataset.single = String(panel.count === 1);
 const frame = panel.window.getBoundingClientRect();
 for (const element of panel.flow.querySelectorAll('a, button')) {
 const visible = [...element.getClientRects()].some(rect => intersects(rect, frame));
 element.tabIndex = visible ? 0 : -1;
 }
 }

 function measure() {
 if (['home', 'burn', 'buybacks', 'liquidity', 'weather', 'funding', 'name'].includes(document.body.dataset.view)) return;
 for (const panel of panels) {
 if (!panel.element.getClientRects().length) continue;
 const width = panel.window.getBoundingClientRect().width;
 panel.stride = width + 40;
 panel.count = Math.max(1, Math.ceil((panel.flow.scrollWidth + 40) / panel.stride -.01));
 position(panel);
 }
 if (document.body.dataset.view === 'journal' && journal.dataset.loading === 'true') return;
 if (document.body.dataset.view === 'hooks' && hooks.dataset.loading === 'true') return;
 if (notes.dataset.contentReady !== 'true') return;
 const pending = notes.dataset.writing === 'pending';
 // Reading never waits for a font or a per-character animation.
 delete notes.dataset.writing;
 if (pending && notes.dataset.writing !== 'pending') {
 (document.body.dataset.view === 'journal' ? journal : document.body.dataset.view === 'hooks' ? hooks : notes.querySelector(layout.dataset.panel === 'journal' ? '.claus-log' : '.note')).focus({preventScroll: true});
 }
 }

 function schedule() {
 cancelAnimationFrame(measureFrame);
 measureFrame = requestAnimationFrame(() => { measureFrame = 0; measure(); });
 }

 function scrollPanel(target, behavior) {
 const inset=parseFloat(getComputedStyle(notes).scrollPaddingTop)||80;
 notes.scrollTo({top:notes.scrollTop+target.getBoundingClientRect().top-notes.getBoundingClientRect().top-inset,behavior});
 }

 for (const panel of panels) {
 if (!panel.controls) continue;
 const turn = async direction => {
 if (panel.turning || compact.matches) return;
 const target = Math.max(0, Math.min(panel.page + direction, panel.count - 1));
 if (target === panel.page) return;
 panel.turning = true;
 position(panel);
 const route = location.pathname;
 let fade;
 try {
 if (!reduced.matches) {
 fade = panel.window.animate([{opacity: 1}, {opacity: 0}], {duration: 90, easing: 'ease-out', fill: 'forwards'});
 await fade.finished;
 }
 if (location.pathname !== route || compact.matches || !panel.element.getClientRects().length) return;
 panel.window.style.opacity = '0';
 fade?.cancel();
 panel.page = target;
 cancelAnimationFrame(measureFrame);
 measure();
 panel.window.style.removeProperty('opacity');
 if (!reduced.matches) panel.window.animate([{opacity: 0}, {opacity: 1}], {duration: 150, easing: 'ease-out'});
 } finally {
 fade?.cancel();
 panel.window.style.removeProperty('opacity');
 panel.turning = false;
 if (panel.element.getClientRects().length) position(panel);
 }
 };
 panel.previous.addEventListener('click', () => turn(-1));
 panel.next.addEventListener('click', () => turn(1));
 panel.element.addEventListener('keydown', event => {
 if (event.key === 'ArrowRight' && !panel.next.disabled) { event.preventDefault(); turn(1); }
 if (event.key === 'ArrowLeft' && !panel.previous.disabled) { event.preventDefault(); turn(-1); }
 });
 }
 notes.querySelectorAll('.section-switch button').forEach(button => button.addEventListener('click', () => {
 // On a phone these are shortcuts within the full, scrollable document.
 layout.dataset.panel = button.dataset.panel;
 const target = notes.querySelector(button.dataset.panel === 'journal' ? '.claus-log' : '.claus-about');
 scrollPanel(target, reduced.matches ? 'instant' : 'smooth');
 notes.querySelectorAll('.section-switch button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
 }));
 window.addEventListener('claus:view', () => {
 cancelAnimationFrame(measureFrame);
 if (document.body.dataset.view === 'home') return;
 panels.forEach(panel => { panel.page = 0; });
 notes.querySelectorAll('.section-switch button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.panel === layout.dataset.panel)));
 notes.scrollTop = 0;
 fitShell();
 schedule();
 });
 window.addEventListener('claus:ready', () => {
 schedule();
 if (compact.matches && document.body.dataset.view === 'notes' && layout.dataset.panel === 'journal') {
 requestAnimationFrame(() => scrollPanel(notes.querySelector('.claus-log'), 'instant'));
 }
 });
 window.addEventListener('claus:content', () => {
 // Prepare newly published text in the same task as the DOM update.
 cancelAnimationFrame(measureFrame);
 measure();
 });
 const resized = () => {
 if (document.body.dataset.view === 'home') return;
 fitShell();
 measure();
 };
 window.addEventListener('resize', resized);
 compact.addEventListener('change', resized);
 // Native columns track the actual width throughout its short transition.
 const sizes = new WeakMap();
 const observer = new ResizeObserver(entries => {
 let changed = false;
 for (const entry of entries) {
 const size = entry.contentRect.width + ":" + entry.contentRect.height;
 if (sizes.get(entry.target) !== size) { sizes.set(entry.target, size); changed = true; }
 }
 if (changed) schedule();
 });
 panels.forEach(panel => observer.observe(panel.window));
 reduced.addEventListener('change', () => { fitShell(); schedule(); });
 document.addEventListener('visibilitychange', () => {
 if (!document.hidden) { fitShell(); schedule(); }
 });
 document.fonts.ready.then(() => { fitShell(); schedule(); });
 fitShell();
 schedule();
})();
