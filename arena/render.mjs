import { WORLD, PLATFORMS, clamp, waterSurface, waterLevel } from '/arena/shared/game.mjs';
import { FollowCamera } from './camera.mjs';
import { SUMMIT, courseFor } from '/arena/shared/course.mjs';
import { SHOTS } from '/arena/shared/hazards.mjs';
import { footOutline, limbMotions, plantedShift, moveHand } from './pose.mjs';
export const ORANGE = '#ec673a', CREAM = '#fff2d8';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.image = new Image();
    this.width = 1; this.height = 1; this.camera = 0; this.cameraY = 0; this.cameraKey = '';
    this.scale = 1; this.offsetX = 0; this.positions = new Map();
    this.follow = new FollowCamera();
    this.platformPaths = new Map(PLATFORMS.map(platform => {
      const path = new Path2D();
      for (const polygon of platform.parts) { path.moveTo(...polygon[0]); for (let i=1;i<polygon.length;i++) path.lineTo(...polygon[i]); path.closePath(); }
      return [platform, path];
    }));
    this.pointer = { x: -1000, y: -1000 };
    this.limbShapes = [
      {root:[362,639],points:[[110,568],[343,618],[482,642],[452,741],[354,845],[110,867]],phase:0},
      {root:[524,659],points:[[427,636],[594,636],[623,910],[418,910]],phase:2.1},
      {root:[654,645],points:[[581,620],[818,675],[922,684],[927,870],[614,863],[553,673]],phase:4.2}
    ];
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ready = new Promise((resolve, reject) => {
      this.image.onload = () => {
        this.blackImage=document.createElement('canvas');this.blackImage.width=this.blackImage.height=256;
        this.blackImage.getContext('2d').drawImage(this.image,0,0,256,256);
        this.silhouette={root:[0,0],outline:footOutline(this.blackImage.getContext('2d').getImageData(0,0,256,256))};
        this.redImage=document.createElement('canvas');this.redImage.width=this.redImage.height=256;
        const ink=this.redImage.getContext('2d');ink.drawImage(this.blackImage,0,0);
        ink.globalCompositeOperation='source-in';ink.fillStyle='#b3152a';ink.fillRect(0,0,256,256);
        const mask = points => {
          const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
          const c=canvas.getContext('2d');c.scale(.25,.25);c.beginPath();c.moveTo(...points[0]);
          for(const point of points.slice(1))c.lineTo(...point);c.closePath();c.clip();c.drawImage(this.blackImage,0,0,1024,1024);return canvas;
        };
        this.bodyImage=mask([[0,0],[1024,0],[1024,564],[791,564],[728,645],[675,690],[348,690],[292,574],[0,574]]);
        this.limbImages=this.limbShapes.map(limb=>{
          const canvas=mask(limb.points);
          limb.outline=footOutline(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));
          return canvas;
        });resolve();
      };
      this.image.onerror = reject;
    });
    this.image.src = '/arena/brand/claus-ink.svg';
    this.art = new Image(); this.artReady = false;
    this.art.onload = async () => { try { await this.art.decode(); this.artReady = true; } catch {} };
    this.art.src = '/arena/arena-art.png';
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    this.width = rect.width; this.height = rect.height;
    const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.dpr = dpr;
  }
  worldPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left - this.offsetX) / this.scale + this.camera,
      y: (clientY - rect.top) / this.scale + this.cameraY };
  }
  clear() {
    const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = ORANGE; c.fillRect(0, 0, this.width, this.height);
  }
  eyes(c, time, x, look, flip = 1) {
    const phase = ((time + x * .031) % 5.7);
    const blink = !this.reduced && phase > 5.5 ? Math.max(.07, Math.abs(phase - 5.6) * 10) : 1;
    for (const e of [{ x: 543.5, y: 367, rx: 61.5, ry: 84.5, r: 26 }, { x: 690.5, y: 376.5, rx: 50, ry: 63, r: 20 }]) {
      c.save(); c.beginPath(); c.ellipse(e.x, e.y, e.rx, e.ry * blink, 0, 0, Math.PI * 2);
      c.clip(); c.fillStyle = CREAM; c.fill();
      const d = Math.hypot(look.x, look.y) || 1;
      c.beginPath(); c.fillStyle = '#000';
      c.arc(e.x + flip * look.x / d * (e.rx - e.r) * .8,
        e.y + look.y / d * (e.ry - e.r) * .8, e.r, 0, Math.PI * 2); c.fill(); c.restore();
    }
  }
  // The logo keeps the original silhouette, with no whole-body rocking.
  character(c, x, footY, size, time, options = {}) {
    if (!this.image.naturalWidth) return;
    const flip=options.flip||1;
    c.save(); c.translate(x, footY); c.scale(flip * size / 1024, size / 1024); c.translate(-512, -870);
    if(options.pose)this.walkingBody(c,options.pose,{x,footY,size,flip},options.platforms);
    else {
      if(options.angry)c.translate(0,plantedShift([this.silhouette],[{angle:0,y:0}],{x,footY,size,flip},options.platforms));
      c.drawImage(options.angry?this.redImage:this.blackImage, 0, 0, 1024, 1024);
    }
    this.eyes(c, time, x, options.look || { x: 0, y: 0 },flip);
    if(options.angry) {
      c.strokeStyle='#b3152a';c.lineWidth=27;c.lineCap='round';c.beginPath();
      c.moveTo(489,293);c.lineTo(585,326);c.moveTo(644,332);c.lineTo(730,302);c.stroke();
    }
    c.restore();
  }
  walkingBody(c, pose, placement, platforms) {
    const limbs=limbMotions(pose,this.limbShapes);
    const planted=pose.grounded?plantedShift(this.limbShapes,limbs,placement,platforms):0;
    for(let i=0;i<limbs.length;i++){
      const limb=this.limbShapes[i],motion=limbs[i];
      c.save();c.translate(limb.root[0],limb.root[1]+motion.y+planted);c.rotate(motion.angle);c.translate(-limb.root[0],-limb.root[1]);
      c.drawImage(this.limbImages[i],0,0,1024,1024);c.restore();
    }
    // Soft joints cover the cut between a moving tentacle and the fixed body.
    c.fillStyle='#000';
    for(const limb of this.limbShapes){c.beginPath();c.ellipse(limb.root[0],limb.root[1],37,34,0,0,Math.PI*2);c.fill();}
    c.drawImage(this.bodyImage,0,0,1024,1024);
  }
  ribbon(c, start, first, second, end, width=4) {
    const left=[],right=[];
    for(let i=0;i<=16;i++){
      const t=i/16,u=1-t,x=u*u*u*start.x+3*u*u*t*first.x+3*u*t*t*second.x+t*t*t*end.x,y=u*u*u*start.y+3*u*u*t*first.y+3*u*t*t*second.y+t*t*t*end.y;
      const dx=3*u*u*(first.x-start.x)+6*u*t*(second.x-first.x)+3*t*t*(end.x-second.x),dy=3*u*u*(first.y-start.y)+6*u*t*(second.y-first.y)+3*t*t*(end.y-second.y),length=Math.hypot(dx,dy)||1;
      const radius=width*(1-t*.62);left.push([x-dy/length*radius,y+dx/length*radius]);right.push([x+dy/length*radius,y-dx/length*radius]);
    }
    c.fillStyle='#000';c.beginPath();c.moveTo(...left[0]);for(const p of left.slice(1))c.lineTo(...p);for(const p of right.reverse())c.lineTo(...p);c.closePath();c.fill();
  }
  arm(c,p,position,dt) {
    if(p.anchor)position.handSide=Math.sign(p.anchor.x-position.x)||p.facing;
    const side=position.handSide??p.facing;
    const root={x:position.x+side*9,y:position.y+4};
    position.hand=moveHand(position.hand,root,p.anchor,dt);
    if(!position.hand){position.handSide=null;return;}
    const tip=position.hand,dx=tip.x-root.x,dy=tip.y-root.y,length=Math.hypot(dx,dy)||1;
    const curl=Math.min(28,length*.35);
    this.ribbon(c,root,{x:root.x+side*curl,y:root.y+curl*.35},
      {x:tip.x-side*Math.min(12,length*.12),y:tip.y+Math.min(20,length*.25)},tip);
  }
  player(c, p, position, time, platforms) {
    this.character(c,position.x,position.y+WORLD.radius,64,time,{
      flip:p.facing===-1?-1:1,pose:position.pose,platforms,
      look:this.pointer.x>0?this.worldLook(position.x,position.y):{x:p.vx||80,y:p.vy*.3}
    });
  }
  platform(c, platform) {
    c.fillStyle = '#000'; c.fill(this.platformPaths.get(platform));
  }
  water(c, y, width, bottom, time, amplitude = 5, state = null) {
    c.fillStyle = CREAM; c.beginPath(); c.moveTo(0, bottom);
    for (let x = 0; x <= width + 4; x += 4) {
      const surface = state ? waterSurface(state, x) : y + Math.sin(x / 76 + time * .95) * amplitude + Math.sin(x / 37 - time * .7) * amplitude * .3;
      c.lineTo(x, surface);
    }
    c.lineTo(width + 4, bottom); c.closePath(); c.fill();
  }
  menu(time, stage = 'entry') {
    this.clear();
    if (!['entry','lobby'].includes(stage) || !this.artReady) return;
    const c = this.ctx, w = this.width, h = this.height, mobile = w < 700;
    const area = mobile ? {x:0,y:180,w,h:Math.max(0,h-188)} : {x:w*.48,y:12,w:w*.52,h:h-24};
    const scale = Math.min(area.w / 1095, area.h / 747);
    if (scale <= 0) return;
    const x = area.x + (area.w - 1095 * scale) / 2, y = area.y + (area.h - 747 * scale) / 2;
    c.save(); c.translate(x - 441 * scale, y - 90 * scale); c.scale(scale, scale);
    c.drawImage(this.art, 0, 0);
    const pointer = {x:(this.pointer.x-x)/scale+441,y:(this.pointer.y-y)/scale+90};
    const phase = time % 5.7;
    const blink = !this.reduced && phase > 5.5 ? Math.max(.06, Math.abs(phase-5.6)*10) : 1;
    for (const eye of [{x:664,y:424,rx:48,ry:70,r:20},{x:785,y:419,rx:43,ry:59,r:18}]) {
      c.fillStyle = '#000'; c.beginPath(); c.ellipse(eye.x,eye.y,eye.rx+1,eye.ry+1,0,0,Math.PI*2); c.fill();
      c.save(); c.beginPath(); c.ellipse(eye.x,eye.y,eye.rx,eye.ry*blink,0,0,Math.PI*2); c.clip();
      c.fillStyle = CREAM; c.fill();
      const dx=pointer.x-eye.x,dy=pointer.y-eye.y,distance=Math.hypot(dx,dy)||1;
      c.fillStyle='#000'; c.beginPath(); c.arc(eye.x+dx/distance*(eye.rx-eye.r)*.8,eye.y+dy/distance*(eye.ry-eye.r)*.8,eye.r,0,Math.PI*2); c.fill(); c.restore();
    }
    c.restore();
  }
  game(state, ownId, time, dt, age, predicted = null) {
    this.clear(); const c = this.ctx, w = this.width, h = this.height;
    const players = predicted ? state.players.map(p => p.id === ownId ? predicted : p) : state.players;
    const focus = players.find(p => p.id === ownId);
    const key = `${ownId}:${state.round}`;
    if (key !== this.cameraKey) { this.cameraKey = key; this.follow.key = ''; this.positions.clear(); }
    for (const p of players) {
      if (!p.alive || p.waiting) continue;
      const old = this.positions.get(p.id) || { x: p.x, y: p.y, pose:{phase:0,move:0,air:p.grounded?0:1} };
      const priorX=old.x;
      const future = predicted && p.id === ownId ? 0 : Math.min(age, .05), tx = clamp(p.x + p.vx * future, 17, WORLD.width - 17);
      const ty = p.grounded ? p.y : p.y + p.vy * future;
      const factor = 1 - Math.exp(-dt * (p.id === ownId ? 38 : 22));
      old.x += (tx - old.x) * factor;
      old.y = p.grounded ? p.y : old.y + (ty - old.y) * factor;
      old.pose.phase+=Math.abs(old.x-priorX)/18;
      const blend=1-Math.exp(-dt*14);
      old.pose.move+=(Math.min(1,Math.abs(p.vx)/200)*(p.grounded?1:.25)-old.pose.move)*blend;
      old.pose.air+=((p.grounded?0:1)-old.pose.air)*blend;
      old.pose.grounded=p.grounded;
      this.positions.set(p.id, old);
    }
    // Follow the same interpolated position we draw, never an opponent or a raw packet.
    const position = this.positions.get(ownId) || focus || {x:600,y:WORLD.floor};
    const camera = this.follow.update({...position,vx:focus?.vx || 0,vy:focus?.vy || 0},w,h,dt,key,this.reduced,state.endless);
    this.camera = camera.x; this.cameraY = camera.y; this.scale = camera.scale; this.offsetX = camera.offsetX;
    const viewH = camera.viewHeight;
    c.save(); c.translate(this.offsetX - this.camera * this.scale, -this.cameraY * this.scale); c.scale(this.scale, this.scale);
    const course=state.endless?courseFor(position.y):null,platforms=course?.platforms||PLATFORMS;
    if(this.courseKey!==course?.key) {
      this.courseKey=course?.key;this.platformPaths.clear();
      for(const platform of platforms) {
        const path=new Path2D();
        for(const polygon of platform.parts){path.moveTo(...polygon[0]);for(const p of polygon.slice(1))path.lineTo(...p);path.closePath();}
        this.platformPaths.set(platform,path);
      }
    }
    for (const p of platforms) if (p.y + p.h >= this.cameraY - 40 && p.y < this.cameraY + viewH + 30) this.platform(c, p);
    for(const enemy of state.enemies||[])if(enemy.y>this.cameraY-60&&enemy.y<this.cameraY+viewH+40){
      this.character(c,enemy.x,enemy.y+12,58,time,{angry:true,flip:enemy.facing,platforms,look:{x:enemy.aimX-enemy.x,y:enemy.aimY-enemy.y}});
      if(enemy.windup>0){
        const ready=1-enemy.windup/SHOTS.windup,bx=enemy.x+enemy.facing*20,by=enemy.y-10-ready*14;
        c.strokeStyle='#b3152a';c.lineWidth=4;c.lineCap='round';c.beginPath();
        c.moveTo(enemy.x,enemy.y-5);c.quadraticCurveTo(bx+enemy.facing*8,enemy.y+5,bx,by);c.stroke();
        c.fillStyle='#b3152a';c.beginPath();c.arc(bx,by,SHOTS.radius,0,Math.PI*2);c.fill();
        c.strokeStyle=CREAM;c.lineWidth=1.5;c.beginPath();c.arc(bx,by,9,-Math.PI/2,-Math.PI/2+ready*Math.PI*2);c.stroke();
      }
    }
    for(const shot of state.projectiles||[]){
      const t=Math.min(age,.05),x=shot.x+shot.vx*t,y=shot.y+shot.vy*t+SHOTS.gravity*t*t/2;
      c.fillStyle='#b3152a';c.strokeStyle=CREAM;c.lineWidth=1.25;c.beginPath();c.arc(x,y,SHOTS.radius,0,Math.PI*2);c.fill();c.stroke();
    }
    if (!state.endless && this.cameraY < SUMMIT.y + 80) {
      c.fillStyle = '#000';
      for (const x of [SUMMIT.x+24,SUMMIT.x+SUMMIT.w-24]) {
        c.fillRect(x,SUMMIT.y-64,3,64);
        c.beginPath();c.moveTo(x,SUMMIT.y-64);c.lineTo(x+35,SUMMIT.y-54);c.lineTo(x,SUMMIT.y-42);c.fill();
      }
    }
    // Other players are drawn first and translucent, including their tentacles.
    for (const p of [...players].sort((a, b) => Number(a.id === ownId) - Number(b.id === ownId))) {
      if (!p.alive || p.waiting) continue;
      const old = this.positions.get(p.id);
      if (old.y < this.cameraY - 80 || old.y > this.cameraY + viewH + 80) continue;
      c.save(); c.globalAlpha = p.id === ownId ? 1 : .34;
      if(p.hitGrace>0)c.globalAlpha*=.65;
      this.arm(c,p,old,dt);
      this.player(c, p, old, time, platforms); c.restore();
    }
    // Advance the water's phase between packets; never extrapolate through a long outage.
    const future = Math.min(age, .05);
    const currentExtra = state.extraWater ?? 0;
    const extraWater = currentExtra + ((state.targetExtra ?? currentExtra) - currentExtra) * (1 - Math.exp(-future * .7));
    const waterState = { ...state, time: state.time + future, water: waterLevel(state.phaseTime + future, extraWater,state.endless) };
    this.water(c, state.water, WORLD.width, WORLD.height + viewH, waterState.time, 4, waterState);
    c.restore();
    const waveAge = waterState.time - state.waveAt;
    if (waveAge >= 0 && waveAge < 2.5) {
      // A small crest mark ties the pulse to the water without another text label.
      c.save();c.globalAlpha=Math.min(1,(2.5-waveAge)*2);c.strokeStyle='#000';c.lineWidth=1.5;
      c.beginPath();for(let x=0;x<=w;x+=5){const wx=(x-this.offsetX)/this.scale+this.camera,y=(waterSurface(waterState,wx)-this.cameraY)*this.scale;(x?c.lineTo(x,y):c.moveTo(x,y));}c.stroke();c.restore();
    }
  }

  worldLook(x, y) {
    return { x: (this.pointer.x - this.offsetX) / this.scale + this.camera - x,
      y: this.pointer.y / this.scale + this.cameraY - y };
  }
}
