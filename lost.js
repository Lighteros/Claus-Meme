(() => {
  const eyes = window.ClausEyes.create();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let pointer = {x: innerWidth / 2, y: innerHeight / 2}, frame = 0, last = 0;
  function render(now) {
    frame = 0;
    const moving = eyes.update(pointer, Math.min(64, now - last || 16), reduced.matches);
    last = now;
    if (moving && !document.hidden) frame = requestAnimationFrame(render);
  }
  function wake() { if (!frame && !document.hidden) frame = requestAnimationFrame(render); }
  addEventListener('pointermove', event => { pointer = {x:event.clientX,y:event.clientY}; wake(); }, {passive:true});
  addEventListener('resize', wake);
  addEventListener('visibilitychange', wake);
  wake();
})();
