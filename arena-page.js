(() => {
  const frame=document.getElementById('arena-game'),unavailable=document.getElementById('arena-unavailable');
  const eyes=window.ClausEyes.create(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const help=document.getElementById('hook-details');
  let pointer={x:innerWidth/2,y:innerHeight/2},eyeFrame=0,last=0,gameOrigin=null;
  function animate(now){eyeFrame=0;const moving=eyes.update(pointer,Math.min(64,now-last||16),reduced.matches);last=now;if(moving&&!document.hidden)eyeFrame=requestAnimationFrame(animate);}
  function move(x,y){pointer={x,y};if(!eyeFrame&&!document.hidden)eyeFrame=requestAnimationFrame(animate);}
  document.getElementById('hook-help').addEventListener('click',()=>help.showModal());
  document.getElementById('close-help').addEventListener('click',()=>help.close());
  help.addEventListener('click',event=>{const r=help.getBoundingClientRect();if(event.target===help&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))help.close();});
  addEventListener('pointermove',event=>{
    move(event.clientX,event.clientY);
    if(gameOrigin){const rect=frame.getBoundingClientRect();frame.contentWindow.postMessage({type:'claus-arena-pointer',x:event.clientX-rect.left,y:event.clientY-rect.top},gameOrigin);}
  },{passive:true});
  addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||event.origin!==gameOrigin)return;
    if(event.data?.type==='claus-arena-pointer'&&Number.isFinite(event.data.x)&&Number.isFinite(event.data.y)){
      const rect=frame.getBoundingClientRect();move(rect.left+event.data.x,rect.top+event.data.y);return;
    }
    if(event.data?.type==='claus-arena-size'&&['entry','lobby','playing','leaderboard'].includes(event.data.stage))document.body.dataset.gameStage=event.data.stage;
  });
  fetch('/arena-config.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error();return response.json();}).then(async config=>{
    if(!config.gameUrl){unavailable.hidden=false;return;}
    if(config.requiresPublishedHook){
      const response=await fetch('/state.json',{cache:'no-store'});if(!response.ok)throw Error();
      const state=await response.json();
      if(!state.functions?.some(item=>item.href==='https://claus.si/Hooks/Arena')){unavailable.hidden=false;return;}
    }
    const url=new URL(config.gameUrl,location.origin);
    if(url.username||url.password||!(url.protocol==='https:'||(url.origin===location.origin&&['127.0.0.1','localhost'].includes(url.hostname))))throw Error();
    url.searchParams.set('embed','1');gameOrigin=url.origin;frame.src=url.href;frame.hidden=false;unavailable.hidden=true;
  }).catch(()=>{unavailable.textContent='The game could not load. Refresh to try again.';unavailable.hidden=false;});
  fetch('/fee-state.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
    if(data?.chainId!==1 || data.hook!=='0x37Bfb8AC7C960E558657871D41Ca70E07e7DbfFf')return;
    const rule=document.getElementById('arena-wave-rule');
    if(rule)rule.textContent='Trades in the main $CLAUS pool add small waves once included on Ethereum. At most one every 12 seconds, '+(data.processing?.marketWaveWindowSeconds===120?'eight within any two-minute window.':'eight per run.')+' Water rises between trades too.';
  }).catch(()=>{});
  move(pointer.x,pointer.y);
})();
