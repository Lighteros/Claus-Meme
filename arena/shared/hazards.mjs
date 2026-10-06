import { WORLD, PLATFORMS, ENEMY_POSTS } from './course.mjs';

export const SHOTS=Object.freeze({gravity:240,radius:6,windup:.95,interval:6,lifetime:3.4,limit:6,grace:1.25});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function createHazards(posts=ENEMY_POSTS) {
 return {enemies:posts.map((post,i)=>({...post,cooldown:.75+i*.3,windup:0,
 facing:post.x<WORLD.width/2?1:-1,aimX:post.x,aimY:post.y})),projectiles:[],projectileId:0};
}

// Swept tests prevent a fast projectile crossing a thin ledge or player between ticks.
export function segmentCircleTime(a,b,x,y,r) {
 const dx=b.x-a.x,dy=b.y-a.y,ox=a.x-x,oy=a.y-y;
 const c=ox*ox+oy*oy-r*r;if(c<=0)return 0;
 const aa=dx*dx+dy*dy;if(aa<1e-12)return Infinity;
 const bb=2*(ox*dx+oy*dy),disc=bb*bb-4*aa*c;
 if(disc<0)return Infinity;
 const t=(-bb-Math.sqrt(disc))/(2*aa);
 return t>=0&&t<=1?t:Infinity;
}

export function segmentPolygonTime(a,b,polygon,radius=0) {
 let enter=0,exit=1;
 for(let i=0;i<polygon.length;i++) {
 const p=polygon[i],q=polygon[(i+1)%polygon.length],ex=q[0]-p[0],ey=q[1]-p[1];
 const start=ex*(a.y-p[1])-ey*(a.x-p[0])+radius*Math.hypot(ex,ey);
 const slope=ex*(b.y-a.y)-ey*(b.x-a.x);
 if(Math.abs(slope)<1e-10){if(start<0)return Infinity;continue;}
 const t=-start/slope;
 if(slope>0)enter=Math.max(enter,t);else exit=Math.min(exit,t);
 if(enter>exit)return Infinity;
 }
 return enter;
}

function throwShot(game,enemy) {
 if(game.projectiles.length>=SHOTS.limit)return;
 const x=enemy.x+enemy.facing*20,y=enemy.y-24;
 const dx=enemy.aimX-x,dy=enemy.aimY-y;
 const flight=clamp(Math.hypot(dx,dy)/205,1.2,2.4);
 game.projectiles.push({id:++game.projectileId,x,y,vx:dx/flight,
 vy:dy/flight-SHOTS.gravity*flight/2,age:0,source:enemy.platform});
}

export function stepHazards(game,dt) {
 for(const player of game.players)player.hitGrace=Math.max(0,player.hitGrace-dt);
 for(const enemy of game.enemies) {
 if(enemy.windup>0) {
 enemy.windup=Math.max(0,enemy.windup-dt);
 if(enemy.windup===0){throwShot(game,enemy);enemy.cooldown=SHOTS.interval;}
 continue;
 }
 enemy.cooldown=Math.max(0,enemy.cooldown-dt);
 if(enemy.cooldown>0)continue;
 const target=game.players.filter(p=>p.alive&&!p.waiting&&p.y-enemy.y<250&&p.y-enemy.y>-170)
.map(p=>({p,d:Math.hypot(p.x-enemy.x,p.y-enemy.y)}))
.filter(({d})=>d>85&&d<550).sort((a,b)=>a.d-b.d)[0]?.p;
 if(!target)continue;
 enemy.facing=Math.sign(target.x-enemy.x)||enemy.facing;
 enemy.aimX=target.x;enemy.aimY=target.y;enemy.windup=SHOTS.windup;
 }
 game.projectiles=game.projectiles.filter(shot=>{
 const a={x:shot.x,y:shot.y};
 shot.x+=shot.vx*dt;shot.y+=shot.vy*dt+SHOTS.gravity*dt*dt/2;
 shot.vy+=SHOTS.gravity*dt;shot.age+=dt;
 if(shot.age>SHOTS.lifetime||shot.x<-50||shot.x>WORLD.width+50||shot.y>game.water)return false;
 let hitAt=Infinity;
 for(const platform of game.course?.platforms || PLATFORMS) {
 if(shot.source===platform.id&&shot.age<.12)continue;
 const r=SHOTS.radius;
 if(Math.max(a.x,shot.x)+r<platform.x||Math.min(a.x,shot.x)-r>platform.x+platform.w||
 Math.max(a.y,shot.y)+r<platform.y||Math.min(a.y,shot.y)-r>platform.y+platform.h)continue;
 for(const polygon of platform.parts)hitAt=Math.min(hitAt,segmentPolygonTime(a,shot,polygon,r));
 }
 let victim=null;
 for(const player of game.players) {
 if(!player.alive||player.waiting)continue;
 const at=segmentCircleTime(a,shot,player.x,player.y,WORLD.radius+SHOTS.radius);
 if(at<hitAt){victim=player;hitAt=at;}
 }
 if(victim&&victim.hitGrace<=0) {
 victim.vx=(Math.sign(shot.vx)||1)*180;victim.vy=Math.min(victim.vy,-155);
 victim.stun=.16;victim.hitGrace=SHOTS.grace;victim.anchor=null;victim.grounded=false;
 }
 return hitAt===Infinity;
 });
}
