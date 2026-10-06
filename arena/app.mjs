import { Renderer } from './render.mjs';
import { WORLD } from '/arena/shared/game.mjs';
import { InputChannel } from './input-channel.mjs';
import { MovementPreview } from './movement.mjs';
const $=id=>document.getElementById(id);
const embedded=new URL(location.href).searchParams.get('embed')==='1' && window.parent!==window;
document.documentElement.classList.toggle('embedded',embedded);
document.documentElement.classList.toggle('touch',navigator.maxTouchPoints>0);
let parentOrigin=null,embedSize='';
if(embedded){try{parentOrigin=new URL(document.referrer).origin;}catch{}}
const renderer=new Renderer($('arena')),keys=new Set(),touch=new Set();
const inputChannel=new InputChannel(),movement=new MovementPreview();
let frameRequest=0,lastMenuDraw=-Infinity,menuDrawKey='',menuWasBlinking=false;
let socket=null,state=null,ownId=null,room=null,token=null,intentionalClose=false;
let received=0,priorTime=performance.now(),reconnectTimer=null,reconnectAttempt=0;
let pointerGrab=false,aim={x:null,y:null},active=false,lastUI=0,wasActive=false;
let profile=null,boardRevision=-1,boardBusy=false;
const timeText=seconds=>{seconds=Math.max(0,Math.floor(seconds));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
const text=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=value;};
try {
 const saved=JSON.parse(localStorage.getItem('claus-arena-profile')||'null');
 if(saved && /^[a-f0-9]{48}$/.test(saved.token) && typeof saved.name==='string'){
 profile=saved;$('username').value=saved.name;
 }
}catch{}
async function refreshBoard() {
 if(boardBusy || document.hidden)return;boardBusy=true;
 try {
 const response=await fetch('/arena/leaderboard.json');if(!response.ok)throw Error();
 const data=await response.json();boardRevision=data.revision;
 $('leaderboard-rows').replaceChildren(...data.players.map(player=>{
 const tr=document.createElement('tr');tr.classList.toggle('own',player.id===(ownId||profile?.id));
 for(const value of [player.rank,player.name,player.points.toLocaleString('en-US'),timeText(player.durationMs/1000)]) {
 const td=document.createElement('td');td.textContent=value;tr.append(td);
 }return tr;
 }));
 $('leaderboard-table').hidden=!data.players.length;$('leaderboard-empty').hidden=!!data.players.length;
 text('leaderboard-empty','No scores yet.');
 }catch{text('leaderboard-empty','Leaderboard unavailable. Try again shortly.');$('leaderboard-empty').hidden=false;}
 finally{boardBusy=false;}
}
for(const button of document.querySelectorAll('[data-open-board]'))button.onclick=()=>{refreshBoard();$('leaderboard').showModal();};
$('close-board').onclick=()=>$('leaderboard').close();
function inputs() {
 if(pointerGrab)aim={
 x:(renderer.pointer.x-renderer.offsetX)/renderer.scale+renderer.camera,
 y:renderer.pointer.y/renderer.scale+renderer.cameraY
 };
 return { type: 'input',
 axis: active ? Number(keys.has('KeyD') || keys.has('ArrowRight') || touch.has('right')) - Number(keys.has('KeyA') || keys.has('ArrowLeft') || touch.has('left')) : 0,
 jump: active && (keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp') || touch.has('jump')),
 grab: active && (keys.has('KeyE') || pointerGrab || touch.has('grab')),
 aimX: aim.x, aimY: aim.y };
}
function sendInput() {
 if (socket?.readyState !== WebSocket.OPEN || !ownId || socket.bufferedAmount > 4096) return;
 const input = inputs(), now = performance.now();
 const message = inputChannel.encode(input, now, active);
 if (message) { movement.input(input, now, inputChannel.sequence); socket.send(message); }
}
function clearInput() {
 keys.clear(); touch.clear(); pointerGrab = false; aim = { x: null, y: null };
 document.querySelectorAll('[data-control]').forEach(b => b.classList.remove('active')); sendInput();
}
function showError(text) { $('error').textContent = text; $('error').hidden = false; }
function connect() {
 clearTimeout(reconnectTimer);intentionalClose=false;$('play').disabled=true;$('error').hidden=true;
 socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/play`);
 const current=socket;
 socket.onopen=()=>current.send(JSON.stringify({type:'join',version:2,username:$('username').value.trim(),
...(profile?{profileToken:profile.token}:{}),...(token?{resume:token}:{})}));
 socket.onmessage=event=>{
 if(current!==socket)return;
 let message;try{message=JSON.parse(event.data);}catch{return;}
 if(message.type==='joined') {
 inputChannel.reset();movement.reset();
 ownId=message.id;room=message.room;token=message.token;reconnectAttempt=0;
 $('username').value=message.name;profile={id:ownId,name:message.name,token:message.profileToken};
 try{localStorage.setItem('claus-arena-profile',JSON.stringify(profile));
 sessionStorage.setItem('claus-arena',JSON.stringify({version:2,token,room}));}catch{}
 state=null;renderer.cameraKey='';renderer.positions.clear();
 $('entry').hidden=true;$('menu').hidden=true;$('reconnecting').hidden=true;$('play').disabled=false;
 }else if(message.type==='state') {
 state=message;received=performance.now();$('reconnecting').hidden=true;
 movement.receive(state,ownId,received);updateUI(received,true);
 }else if(message.type==='pong')movement.latency(performance.now()-message.at);
 else if(message.type==='error'){leave(false);showError(message.message);}
 };
 socket.onerror=()=>{};
 socket.onclose=event=>{
 if(current!==socket || intentionalClose)return;clearInput();
 if(event.code===4001){leave(false);showError('This session is open in another tab.');return;}
 if(++reconnectAttempt<=4){$('reconnecting').hidden=false;reconnectTimer=setTimeout(connect,Math.min(3000,reconnectAttempt*650));}
 else{leave(false);showError('Could not reach the game. Please try again.');}
 };
}
function leave(clearError=true) {
 intentionalClose=true;clearTimeout(reconnectTimer);clearInput();socket?.close(1000,'Left arena');
 socket=null;state=null;ownId=null;token=null;room=null;active=wasActive=false;reconnectAttempt=0;
 movement.reset();document.body.classList.remove('playing');document.body.dataset.stage='entry';
 $('entry').hidden=false;$('play').disabled=false;
 for(const id of ['menu','hud','touch-controls','reconnecting','game-footer'])$(id).hidden=true;
 if(clearError)$('error').hidden=true;
 try{sessionStorage.removeItem('claus-arena');}catch{}
 renderer.cameraKey='';renderer.positions.clear();$('username').focus({preventScroll:true});
}
function validName() {
 const name=$('username').value.trim();
 if(!/^[A-Za-z0-9_][A-Za-z0-9_.-]{1,19}$/.test(name)){
 $('username').setAttribute('aria-invalid','true');
 showError(name?'Use 2–20 letters, numbers, dots, dashes or underscores.':'Enter your username.');
 $('username').focus({preventScroll:true});return false;
 }
 $('username').value=name;$('username').removeAttribute('aria-invalid');
 return true;
}
$('join-form').onsubmit=event=>{event.preventDefault();if($('play').disabled||!validName())return;token=null;connect();};
$('username').addEventListener('input',()=>{$('username').removeAttribute('aria-invalid');$('error').hidden=true;});
$('retry').onclick=()=>{if(socket?.readyState===WebSocket.OPEN && state?.scoreSaved){clearInput();$('retry').disabled=true;socket.send(JSON.stringify({type:'retry'}));}};
$('leave').onclick=()=>leave();
window.addEventListener('keydown', event => {
 if (!active || event.target.closest('button, a, input')) return;
 if (event.repeat) { if (keys.has(event.code)) event.preventDefault(); return; }
 if (['KeyA', 'KeyD', 'KeyW', 'KeyE', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.code)) {
 event.preventDefault(); keys.add(event.code); if (event.code === 'KeyE') aim = { x: null, y: null }; sendInput();
 }
});
window.addEventListener('keyup', event => { keys.delete(event.code); sendInput(); });
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
 if (document.hidden) { clearInput(); cancelAnimationFrame(frameRequest); frameRequest = 0; }
 else { priorTime = performance.now(); lastMenuDraw = -Infinity; if (!frameRequest) frameRequest = requestAnimationFrame(frame); }
});
window.addEventListener('pointermove', event => {
 const rect = $('arena').getBoundingClientRect(); renderer.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
 if (pointerGrab) aim = renderer.worldPoint(event.clientX, event.clientY);
 if(parentOrigin)parent.postMessage({type:'claus-arena-pointer',x:event.clientX,y:event.clientY},parentOrigin);
});
window.addEventListener('message', event => {
 if(!parentOrigin||event.source!==parent||event.origin!==parentOrigin||event.data?.type!=='claus-arena-pointer')return;
 if(!Number.isFinite(event.data.x)||!Number.isFinite(event.data.y))return;
 const rect=$('arena').getBoundingClientRect();
 renderer.pointer={x:event.data.x-rect.left,y:event.data.y-rect.top};
});
$('arena').addEventListener('pointerdown', event => {
 if (!active || event.pointerType === 'touch') return;
 event.preventDefault(); $('arena').focus({ preventScroll: true }); pointerGrab = true;
 const rect=$('arena').getBoundingClientRect();renderer.pointer={x:event.clientX-rect.left,y:event.clientY-rect.top};
 aim = renderer.worldPoint(event.clientX, event.clientY); $('arena').setPointerCapture(event.pointerId); sendInput();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $('arena').addEventListener(event, () => { pointerGrab = false; sendInput(); });
$('arena').addEventListener('contextmenu', event => event.preventDefault());
for (const button of document.querySelectorAll('[data-control]')) {
 button.addEventListener('pointerdown', event => {
 if (!active) return;
 event.preventDefault(); button.setPointerCapture(event.pointerId); touch.add(button.dataset.control); button.classList.add('active');
 if (button.dataset.control === 'grab') aim = { x: null, y: null }; sendInput();
 });
 for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => {
 event.preventDefault(); touch.delete(button.dataset.control); button.classList.remove('active'); sendInput();
 });
}
setInterval(sendInput, 1000 / 30);
setInterval(() => {
 if (active && !document.hidden && socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 4096)
 socket.send(JSON.stringify({ type: 'ping', at: performance.now() }));
}, 2000);

function updateUI(now,force=false) {
 if(!force&&now-lastUI<100)return;lastUI=now;if(!state)return;
 const me=state.players.find(p=>p.id===ownId);
 active=state.phase==='playing' && !!me?.alive;
 document.body.classList.toggle('playing',active);document.body.dataset.stage=active?'playing':'lobby';
 $('entry').hidden=true;$('menu').hidden=active;$('hud').hidden=false;$('run-status').hidden=!active;
 const waveAge=state.time-state.waveAt+(now-received)/1000;
 $('market-wave').hidden=!active || !(state.waveCount>0 && waveAge>=0 && waveAge<3);
 if(active) {
 const points=Math.max(0,Math.floor(WORLD.floor-WORLD.radius-me.bestY));
 text('climb-progress',`${points.toLocaleString('en-US')} ↑`);
 text('round-time',timeText(state.phaseTime+Math.min(2,(now-received)/1000)));
 }else if(state.result) {
 text('result-score',state.result.points.toLocaleString('en-US'));
 text('result-time',timeText(state.result.durationMs/1000));
 $('retry').disabled=!state.scoreSaved;
 $('save-status').hidden=state.scoreSaved;
 if(state.leaderboardRevision!==boardRevision)refreshBoard();
 }
 $('touch-controls').hidden=!active;$('game-footer').hidden=!active;
 if(active&&!wasActive){$('arena').focus({preventScroll:true});$('retry').disabled=false;}
 if(!active&&wasActive){clearInput();$('retry').focus({preventScroll:true});}
 wasActive=active;
 if(now-received>2500)$('reconnecting').hidden=false;
}
function frame(now) {
 frameRequest = 0;
 if (document.hidden) return;
 const dt = Math.min(.05, (now - priorTime) / 1000); priorTime = now;
 updateUI(now);
 if (state && active) renderer.game(state, ownId, now / 1000, dt, (now - received) / 1000, movement.sample(now));
 else {
 const stage = document.body.dataset.stage;
 const key = `${stage}:${renderer.width}:${renderer.height}:${renderer.dpr}:${renderer.artReady}:` +
 (['entry','lobby'].includes(stage) ? `${renderer.pointer.x}:${renderer.pointer.y}` : '');
 const blinking = ['entry','lobby'].includes(stage) && !renderer.reduced && (now / 1000) % 5.7 > 5.5;
 if (now - lastMenuDraw >= 1000 / 30 && (key !== menuDrawKey || blinking || menuWasBlinking)) {
 renderer.menu(now / 1000, stage); lastMenuDraw = now; menuDrawKey = key; menuWasBlinking = blinking;
 }
 }
 if (!embedded) {
 const mark = $('mark'), c = mark.getContext('2d'); c.clearRect(0, 0, mark.width, mark.height);
 renderer.character(c, 48, 87, 100, now / 1000, { look: { x: renderer.pointer.x - 25, y: renderer.pointer.y + 45 } });
 }
 if (parentOrigin) {
 const stage = $('leaderboard').open ? 'leaderboard' : document.body.dataset.stage;
 if (stage !== embedSize) { embedSize = stage; parent.postMessage({type:'claus-arena-size',stage},parentOrigin); }

 }
 frameRequest = requestAnimationFrame(frame);
}

$('play').disabled=true;
renderer.ready.then(()=>{
 $('play').disabled=false;frameRequest=requestAnimationFrame(frame);
 try {
 const saved=JSON.parse(sessionStorage.getItem('claus-arena')||'null');
 if(saved?.version===2 && profile && /^[a-f0-9]{48}$/.test(saved.token)){token=saved.token;connect();}
 }catch{}
}).catch(()=>showError('The character could not load. Refresh to try again.'));
setInterval(()=>{if($('leaderboard').open)refreshBoard();},15000);
