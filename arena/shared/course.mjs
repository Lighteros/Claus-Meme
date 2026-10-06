export const WORLD = Object.freeze({ width: 1200, height: 4800, floor: 4720, radius: 17,
 round: 90, countdown: 10, interval: 30, minimumPlayers: 3, capacity: 20 });

export const PHYSICS = Object.freeze({ gravity: 1450, jumpSpeed: 650, runSpeed: 380,
 groundAcceleration: 2450, airAcceleration: 1550, grabReach: 230 });

const rect = (x, y, w, h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const platforms = [], routes = [[],[]];
function makePlatform(id, x, y, w, shape, extra = {}) {
 let parts, h, anchors;
 switch (shape) {
 case 'stone':
 h=44; parts=[[[x,y+18],[x+w*.22,y],[x+w*.78,y],[x+w,y+18],[x+w*.84,y+h],[x+w*.16,y+h]]];
 anchors=[[x+w*.22,y],[x+w*.78,y]]; break;
 case 'ramp':
 h=44; parts=[[[x,y+30],[x+w,y],[x+w,y+h],[x,y+h]]]; anchors=[[x+w-10,y+3]]; break;
 case 'steps':
 h=52; parts=[rect(x,y+26,w/3,26),rect(x+w/3,y+13,w/3,39),rect(x+w*2/3,y,w/3,52)];
 anchors=[[x+w-12,y]]; break;
 case 'gate': {
 h=82;const cx=x+w/2,cy=y+55;
 const arc=(a,inset)=>[cx+(w/2-inset)*Math.cos(a),cy+(55-inset)*Math.sin(a)];
 parts=Array.from({length:8},(_,i)=>{
 const a=Math.PI+i*Math.PI/8,b=a+Math.PI/8;
 return [arc(a,0),arc(b,0),arc(b,18),arc(a,18)];
 });
 parts.push(rect(x,y+55,18,27),rect(x+w-18,y+55,18,27));
 anchors=[[cx-20,y+3],[cx+20,y+3]]; break;
 }
 case 'wall':
 h=extra.height; parts=[rect(x,y,w,h)]; anchors=[[x+w/2,y]]; break;
 default:
 h=18; parts=[rect(x,y,w,h)]; anchors=[[x+12,y],[x+w-12,y]];
 }
 return {id,x,y,w,h,shape,parts,anchors,oneWay:shape==='ledge',...extra};
}
function platform(...args) { const item=makePlatform(...args); platforms.push(item); return item; }

const floor=platform('floor',0,WORLD.floor,WORLD.width,'wall',{height:32});
const shapes=['ledge','stone','ramp','ledge','steps','stone','gate','ledge'];
const rises=[125,145,155,135,165,150,180,140];
let y=WORLD.floor;
for(let tier=0; y>350; tier++) {
 y-=rises[tier%rises.length];
 for(let lane=0;lane<2;lane++) {
 const offset=(tier%2===0?-1:1)*(tier<2?66:82);
 const center=300+lane*600+offset;
 const shape=tier<2?'ledge':shapes[(tier+lane*3)%shapes.length];
 const width=tier<2?176:shape==='gate'?144:shape==='steps'?126:Math.max(86,130-tier*1.3);
 const node=platform(`route-${lane}-${tier}`,center-width/2,y,width,shape,{lane,tier});
 routes[lane].push(node);
 }
 // Towers between the climbing routes make crossing lanes a deliberate choice.
 if(tier%7===4) {
 const x=tier%14===4?570:610;
 platform(`tower-${tier}`,x,y-62,20,'wall',{height:108});
 }
}

export const SUMMIT=platform('summit',84,180,1032,'ledge',{
 summit:true,anchors:[150,300,450,600,750,900,1050].map(x=>[x,180])
});
for(const route of routes)route.push(SUMMIT);

export const PLATFORMS=Object.freeze(platforms);
export const ROUTES=Object.freeze(routes.map(route=>Object.freeze([floor,...route])));
export const ANCHORS=Object.freeze(platforms.filter(p=>p!==floor).flatMap(p=>p.anchors.map(([x,y])=>({x,y,platform:p.id}))));

// Grips lie anywhere on an exposed upper edge, not in painted sockets.
function gripEdges(items) { return items.filter(p=>p.id!=='floor').flatMap(p=>{
 const edges=p.parts.flatMap(polygon=>polygon.map((a,i)=>({a,b:polygon[(i+1)%polygon.length]}))).filter(e=>e.b[0]>e.a[0]+.001);
 return edges.filter(e=>{
 const x=(e.a[0]+e.b[0])/2,y=(e.a[1]+e.b[1])/2;
 return !edges.some(other=>x>=other.a[0]&&x<=other.b[0]&&
 other.a[1]+(x-other.a[0])/(other.b[0]-other.a[0])*(other.b[1]-other.a[1])<y-.01);
 }).map(e=>({...e,platform:p.id}));
}); }
export const GRIP_EDGES=Object.freeze(gripEdges(platforms));

// Opponents are course hazards, never lobby players or leaderboard entrants.
export const ENEMY_POSTS=Object.freeze([2,8,14,20,26].map((tier,i)=>{
 const perch=routes[i%2][tier];
 const edge=GRIP_EDGES.filter(e=>e.platform===perch.id).sort((a,b)=>(a.a[1]+a.b[1])-(b.a[1]+b.b[1]))[0];
 return Object.freeze({id:`red-${i}`,x:(edge.a[0]+edge.b[0])/2,y:(edge.a[1]+edge.b[1])/2-12,platform:perch.id});
}));

// Generate the same small window on the client and server. Memory and collision
// work stay bounded however high a run climbs; there is no summit in this mode.
const courseCache=new Map(), blockRise=rises.reduce((sum,n)=>sum+n,0);
export function courseFor(playerY) {
 const block=Math.max(0,Math.floor((WORLD.floor-playerY)/blockRise));
 if(courseCache.has(block)) {
 const cached=courseCache.get(block); courseCache.delete(block); courseCache.set(block,cached); return cached;
 }
 const first=Math.max(0,block-1)*8,last=(block+2)*8,items=first===0?[floor]:[];
 let height=WORLD.floor-Math.floor(first/8)*blockRise;
 for(let tier=first;tier<last;tier++) {
 height-=rises[tier%8];
 for(let lane=0;lane<2;lane++) {
 const center=300+lane*600+(tier%2===0?-1:1)*(tier<2?66:82);
 const shape=tier<2?'ledge':shapes[(tier+lane*3)%8];
 const width=tier<2?176:shape==='gate'?144:shape==='steps'?126:Math.max(96,130-tier*1.3);
 items.push(makePlatform(`route-${lane}-${tier}`,center-width/2,height,width,shape,{lane,tier}));
 }
 if(tier%7===4)items.push(makePlatform(`tower-${tier}`,tier%14===4?570:610,height-62,20,'wall',{height:108}));
 }
 const edges=gripEdges(items),enemies=[];
 for(const perch of items)if(perch.tier%6===2&&perch.lane===Math.floor(perch.tier/6)%2) {
 const edge=edges.filter(e=>e.platform===perch.id).sort((a,b)=>(a.a[1]+a.b[1])-(b.a[1]+b.b[1]))[0];
 enemies.push({id:`red-${perch.tier}`,x:(edge.a[0]+edge.b[0])/2,y:(edge.a[1]+edge.b[1])/2-12,platform:perch.id});
 }
 const course={key:block,platforms:items,gripEdges:edges,enemyPosts:enemies};
 courseCache.set(block,course); if(courseCache.size>16)courseCache.delete(courseCache.keys().next().value);
 return course;
}

// Continuous-flight bounds are a first check. Tests also simulate the discrete solver.
export const JUMP_HEIGHT=PHYSICS.jumpSpeed**2/(2*PHYSICS.gravity);
export function jumpFlightTime(rise) {
 const discriminant=PHYSICS.jumpSpeed**2-2*PHYSICS.gravity*rise;
 return discriminant<0?null:(PHYSICS.jumpSpeed+Math.sqrt(discriminant))/PHYSICS.gravity;
}

// Collision and drawing both consume these exact polygons.
export function circleContact(x,y,radius,polygon) {
 let depth=Infinity,normal=null,nearest=null,distance=Infinity;
 const axes=[];
 for(let i=0;i<polygon.length;i++) {
 const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
 axes.push([-dy/length,dx/length]);
 const d=(x-a[0])**2+(y-a[1])**2;if(d<distance){distance=d;nearest=a;}
 }
 if(distance>.000001){const d=Math.sqrt(distance);axes.push([(x-nearest[0])/d,(y-nearest[1])/d]);}
 for(const [nx,ny] of axes) {
 let min=Infinity,max=-Infinity;
 for(const [px,py] of polygon){const d=px*nx+py*ny;min=Math.min(min,d);max=Math.max(max,d);}
 const center=x*nx+y*ny;
 if(center+radius<min||center-radius>max)return null;
 const negative=center+radius-min,positive=max-center+radius;
 if(negative<depth){depth=negative;normal={nx:-nx,ny:-ny};}
 if(positive<depth){depth=positive;normal={nx,ny};}
 }
 return {...normal,depth};
}

export function resolvePlatforms(player,oldY,items=PLATFORMS) {
 player.grounded=false;
 for(let pass=0;pass<3;pass++)for(const q of items) {
 const r=WORLD.radius;
 if(player.x+r<q.x||player.x-r>q.x+q.w||player.y+r<q.y||player.y-r>q.y+q.h)continue;
 if(q.oneWay) {
 if(player.vy<0||oldY+r>q.y+2)continue;
 if(player.x+12>q.x&&player.x-12<q.x+q.w&&player.y+r>=q.y) {
 player.y=q.y-r;player.vy=0;player.grounded=true;
 }
 continue;
 }
 for(const polygon of q.parts) {
 const contact=circleContact(player.x,player.y,r,polygon);if(!contact)continue;
 const {nx,ny,depth}=contact;
 player.x+=nx*depth;player.y+=ny*depth;
 const into=player.vx*nx+player.vy*ny;
 if(into<0){player.vx-=into*nx;player.vy-=into*ny;}
 if(ny<-.55)player.grounded=true;
 }
 }
}

export function clearGrabLine(player,anchor,items=PLATFORMS) {
 const dx=anchor.x-player.x,dy=anchor.y-player.y;
 for(const q of items) {
 if(q.id===anchor.platform||q.oneWay)continue;
 if(Math.max(player.x,anchor.x)<q.x||Math.min(player.x,anchor.x)>q.x+q.w||
 Math.max(player.y,anchor.y)<q.y||Math.min(player.y,anchor.y)>q.y+q.h)continue;
 for(const polygon of q.parts) {
 let enter=.001,exit=.995;
 for(let i=0;i<polygon.length&&enter<=exit;i++) {
 const a=polygon[i],b=polygon[(i+1)%polygon.length],ex=b[0]-a[0],ey=b[1]-a[1];
 const start=ex*(player.y-a[1])-ey*(player.x-a[0]),slope=ex*dy-ey*dx;
 if(Math.abs(slope)<1e-9){if(start<0)exit=-1;continue;}
 const t=-start/slope;if(slope>0)enter=Math.max(enter,t);else exit=Math.min(exit,t);
 }
 if(enter<exit)return false;
 }
 }
 return true;
}
