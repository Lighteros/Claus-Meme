import { rankPlayers } from './scoring.mjs';
import { WORLD, PHYSICS, PLATFORMS, GRIP_EDGES, SUMMIT, courseFor, resolvePlatforms, clearGrabLine } from './course.mjs';
import { createHazards, stepHazards } from './hazards.mjs';
export { WORLD, PHYSICS, PLATFORMS, ANCHORS } from './course.mjs';
// The server owns physics, time, collisions and results. Clients send controls only.
export const STEP = 1 / 60;
export const MARKET_WAVE = Object.freeze({ interval: 12, limit: 8, window: 120, rise: 18 });
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const emptyInput = () => ({ axis: 0, jump: false, grab: false, aimX: null, aimY: null });

export function cleanInput(raw = {}) {
 return {
 axis: raw.axis === -1 ? -1 : raw.axis === 1 ? 1 : 0,
 jump: raw.jump === true,
 grab: raw.grab === true,
 aimX: Number.isFinite(raw.aimX) ? clamp(raw.aimX, 0, WORLD.width) : null,
 aimY: Number.isFinite(raw.aimY) ? Math.min(raw.aimY, WORLD.height) : null
 };
}

export function createGame(seed = 1, { endless = false } = {}) {
 return { seed, endless, course: endless ? courseFor(WORLD.floor) : null, round: 0, time: 0, phase: 'waiting', phaseTime: 0, players: [], entrants: [], standings: [], water: WORLD.height + 6,
 extraWater: 0, targetExtra: 0, waveAt: -100, waveCount: 0, waveTimes: [], result: null, finishReason: null, eventId: 0, events: [],...createHazards() };
}

export function addPlayer(game, id, name, bot = false) {
 if (game.players.length >= WORLD.capacity || game.players.some(p => p.id === id)) return null;
 const player = { id, name, bot, x: 0, y: 0, vx: 0, vy: 0, alive: false, waiting: game.phase === 'playing',
 grounded: false, coyote: 0, jumpBuffer: 0, jumpHeld: false, grabHeld: false, anchor: null,
 grabCooldown: 0, gripAcquired: false, gripWait: 0, stun: 0, hitGrace: 0, facing: 1, bestY: WORLD.floor - WORLD.radius, wins: 0, drown: 0, outAt: null, finishedAt: null, forfeited: false, participated: false, input: emptyInput() };
 game.players.push(player);
 resetPlayer(player, game.players.length - 1, game.round);
 if (game.phase === 'playing') { player.alive = false; player.waiting = true; }
 return player;
}

function resetPlayer(p, index, round) {
 Object.assign(p, { x: 130 + ((index * 139 + round * 53) % 940), y: WORLD.floor - WORLD.radius, vx: 0, vy: 0,
 alive: true, waiting: false, grounded: true, coyote: 0, jumpBuffer: 0, jumpHeld: false,
 grabHeld: false, anchor: null, grabCooldown: 0, gripAcquired: false, gripWait: 0, stun: 0, hitGrace: 0, bestY: WORLD.floor - WORLD.radius, drown: 0, outAt: null, finishedAt: null, forfeited: false, participated: false, input: emptyInput() });
}

export function beginCountdown(game) {
 if (game.phase !== 'waiting') return;
 game.phase = 'countdown'; game.phaseTime = 0;
}

function emit(game, kind, data = {}) {
 game.events.push({ id: ++game.eventId, kind, time: game.time,...data });
 if (game.events.length > 12) game.events.shift();
}

export function startRound(game) {
 game.startedAt = Date.now();
 game.round++; game.phase = 'playing'; game.phaseTime = 0; game.water = WORLD.height + 6;
 game.extraWater = 0; game.targetExtra = 0; game.waveAt = -100; game.waveCount = 0; game.waveTimes = []; game.result = null; game.finishReason = null;
 game.players.forEach((p, i) => resetPlayer(p, i, game.round));
 if(game.endless) { game.players.forEach(p=>p.x=234); game.course=courseFor(WORLD.floor); }
 Object.assign(game,createHazards(game.course?.enemyPosts));
 game.entrants = [...game.players]; game.standings = [];
 emit(game, 'start');
}

// Only the trusted chain reader may call this. No socket message can raise the water.
export function addMarketPulse(game, rolling = game.endless) {
 if (game.phase !== 'playing' || game.time - game.waveAt < MARKET_WAVE.interval) return false;
 game.waveTimes = game.waveTimes.filter(time => time > game.time - MARKET_WAVE.window);
 if (rolling ? game.waveTimes.length >= MARKET_WAVE.limit : game.waveCount >= MARKET_WAVE.limit) return false;
 game.waveTimes.push(game.time);
 game.targetExtra += MARKET_WAVE.rise; game.waveAt = game.time; game.waveCount++;
 emit(game, 'wave'); return true;
}

export function findAnchor(player, input, course=null) {
 let winner = null, best = Infinity;
 for (const edge of course?.gripEdges || GRIP_EDGES) {
 const [ax,ay]=edge.a,[bx,by]=edge.b,dx=bx-ax,dy=by-ay;
 const aimX=input.aimX??player.x,aimY=input.aimY??player.y;
 const t=clamp(((aimX-ax)*dx+(aimY-ay)*dy)/(dx*dx+dy*dy),0,1);
 const anchor={x:ax+dx*t,y:ay+dy*t,platform:edge.platform};
 const distance = Math.hypot(anchor.x - player.x, anchor.y - player.y);
 if (distance > PHYSICS.grabReach || distance < 25 || anchor.y > player.y - 14 || !clearGrabLine(player,anchor,course?.platforms)) continue;
 if (input.aimX !== null && input.aimY !== null) {
 const mx = input.aimX - player.x, my = input.aimY - player.y;
 if ((anchor.x - player.x) * mx + (anchor.y - player.y) * my < Math.hypot(mx, my) * distance *.35) continue;
 }
 const aim = input.aimX === null ? 0 : Math.hypot(anchor.x - input.aimX, anchor.y - input.aimY) *.5;
 const score = distance + aim - (player.y - anchor.y) *.2;
 if (score < best) { best = score; winner = {...anchor, length: Math.max(42, distance), reach: 0 }; }
 }
 return winner;
}

function tryGrab(game, p, allowBump) {
 p.anchor = findAnchor(p, p.input, game.course);
 if (p.anchor) return;
 if (!allowBump || p.grabCooldown > 0) return;
 const victim = game.players.find(other => other.id !== p.id && other.alive &&
 Math.hypot(other.x - p.x, other.y - p.y) < 76 && other.stun <= 0);
 if (!victim) return;
 const direction = Math.sign(victim.x - p.x) || p.facing;
 victim.vx = direction * 330; victim.vy = -210; victim.stun =.3; victim.anchor = null;
 p.grabCooldown = 1.8;
 emit(game, 'bump', { from: p.id, to: victim.id });
}

export function botInput(game, p) {
 const targets = PLATFORMS.filter(q => q.y < p.y + WORLD.radius - 30 && q.y > p.y - 260);
 targets.sort((a, b) => {
 const cost = q => Math.max(0, Math.abs(q.x + q.w / 2 - p.x) - q.w / 2 + 32) + Math.abs(p.y - q.y - 140) *.6;
 return cost(a) - cost(b);
 });
 const target = targets[0];
 if (!target) return {...emptyInput(), axis: Math.abs(p.x - 600) > 55 ? Math.sign(600 - p.x) : 0 };
 const destination = clamp(p.x, target.x + 35, target.x + target.w - 35);
 const difference = destination - p.x;
 return { axis: Math.abs(difference) > 12 ? Math.sign(difference) : 0,
 jump: p.grounded || p.coyote > 0,
 grab: !p.grounded && p.y > target.y + 35 && p.vy > -100,
 aimX: destination, aimY: target.y };
}

export function waterSurface(game, x) {
 const amplitude = game.time - game.waveAt < 5 ? 9 : 4;
 return game.water + Math.sin(x / 76 + game.time *.95) * amplitude
 + Math.sin(x / 37 - game.time *.7) * amplitude *.3;
}
export const ENDLESS_WATER=Object.freeze({grace:8,initialSpeed:18,maxSpeed:60,rampSeconds:150});
export function waterLevel(phaseTime, extraWater, endless=false) {
 if(endless) {
 const {grace,initialSpeed,maxSpeed,rampSeconds}=ENDLESS_WATER,t=Math.max(0,phaseTime-grace);
 const rise=initialSpeed*t+(maxSpeed-initialSpeed)*(t-rampSeconds*(1-Math.exp(-t/rampSeconds)));
 return WORLD.height+6-rise-extraWater;
 }
 // Give a new player time to find the first ledge; keep the same final water height.
 const progress = clamp((phaseTime - 6) / (WORLD.round - 6), 0, 1);
 return WORLD.height + 6 - 4370 * Math.pow(progress, 1.12) - extraWater;
}
export function touchesWater(game, player) {
 const foot = player.y + WORLD.radius;
 return [-20, 0, 20].some(dx => foot >= waterSurface(game, player.x + dx));
}

export function stepPlayer(game, p, dt) {
 const input = p.input;
 if (input.axis || input.jump || input.grab) p.participated = true;
 p.grabCooldown = Math.max(0, p.grabCooldown - dt); p.stun = Math.max(0, p.stun - dt);
 p.gripWait = Math.max(0, (p.gripWait || 0) - dt);
 if (!input.grab) { p.gripAcquired = false; p.gripWait = 0; }
 p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
 p.coyote = p.grounded ?.1 : Math.max(0, p.coyote - dt);
 if (input.jump && !p.jumpHeld) p.jumpBuffer =.14;
 p.jumpHeld = input.jump;
 if (p.jumpBuffer > 0 && p.coyote > 0) {
 p.vy = -PHYSICS.jumpSpeed; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; p.anchor = null;
 emit(game, 'jump', { player: p.id });
 }
 if (p.stun <= 0) {
 p.vx += input.axis * (p.grounded ? PHYSICS.groundAcceleration : PHYSICS.airAcceleration) * dt;
 if (input.axis) p.facing = input.axis;
 else p.vx *= Math.exp(-(p.grounded ? 17 : 2.2) * dt);
 // An early press can catch the next reachable edge. One hold makes one grip,
 // so leaving the key down cannot climb the whole course automatically.
 if (input.grab && !p.anchor && !p.gripAcquired && p.gripWait <= 0) {
 tryGrab(game, p, !p.grabHeld);
 p.gripAcquired = !!p.anchor; p.gripWait =.06;
 }
 }
 p.grabHeld = input.grab;
 if (!input.grab || p.stun > 0) p.anchor = null;
 p.vy += PHYSICS.gravity * dt;
 if (p.anchor) {
 const dx = p.anchor.x - p.x, dy = p.anchor.y - p.y, distance = Math.hypot(dx, dy) || 1;
 p.anchor.reach = Math.min(1, (p.anchor.reach ?? 0) + dt * 5000 / Math.max(1,distance));
 if (p.anchor.reach === 1) {
 p.anchor.length = Math.max(42, p.anchor.length - 145 * dt);
 p.vx += dx / distance * 1280 * dt; p.vy += dy / distance * 1950 * dt;
 if (distance > p.anchor.length) {
 const radial = (p.vx * dx + p.vy * dy) / distance;
 if (radial < 0) { p.vx -= radial * dx / distance; p.vy -= radial * dy / distance; }
 }
 if (distance < 44) { p.anchor = null; p.vy = Math.min(p.vy, -460); }
 }
 }
 p.vx = clamp(p.vx, -PHYSICS.runSpeed, PHYSICS.runSpeed); p.vy = clamp(p.vy, -790, 850);
 const oldY = p.y;
 p.x = clamp(p.x + p.vx * dt, WORLD.radius, WORLD.width - WORLD.radius);
 p.y = game.endless ? p.y + p.vy * dt : Math.max(WORLD.radius, p.y + p.vy * dt); p.grounded = false;
 resolvePlatforms(p,oldY,game.course?.platforms);
 if(p.grounded && p.anchor && p.y + WORLD.radius <= p.anchor.y + 4)p.anchor=null;
 p.bestY = Math.min(p.bestY, p.y);
 if (touchesWater(game, p) || p.y > WORLD.height + 60) {
 p.alive = false; p.anchor = null; p.outAt = game.phaseTime; emit(game, 'out', { player: p.id, x: p.x, y: p.y });
 }
}

function collidePlayers(game) {
 const alive = game.players.filter(p => p.alive);
 for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
 const a = alive[i], b = alive[j], dx = b.x - a.x, dy = b.y - a.y;
 const distance = Math.hypot(dx, dy);
 if (distance >= 29 || distance <.01) continue;
 const nx = dx / distance, ny = dy / distance, separation = (29 - distance) / 2;
 a.x = clamp(a.x - nx * separation, 17, 1183); b.x = clamp(b.x + nx * separation, 17, 1183);
 if (Math.abs(ny) <.7) {
 const closing = (a.vx - b.vx) * nx;
 if (closing > 0) { a.vx -= nx * closing *.7; b.vx += nx * closing *.7; }
 }
 }
 // A player bump must not leave another player inside a solid obstacle.
 for(const p of alive)resolvePlatforms(p,p.y);
}

export function forfeitPlayer(game, player) {
 if (game.phase !== 'playing' || !player.alive || player.waiting) return;
 player.alive = false; player.forfeited = true; player.outAt = game.phaseTime; player.anchor = null;
}

function finishRound(game, reason) {
 game.finishReason = reason;
 game.standings = rankPlayers(game.entrants);
 const firsts = game.standings.filter(p => p.place === 1 && p.status === 'survived');
 const winner = firsts.length === 1 ? game.entrants.find(p => p.id === firsts[0].id) : null;
 if (winner) winner.wins++;
 game.result = winner ? { id: winner.id, name: winner.name, bot: winner.bot } : null;
 game.phase = 'finished'; game.phaseTime = 0;
 emit(game, 'finish', { winner: winner?.id ?? null });
}

export function stepGame(game, dt = STEP) {
 game.time += dt; game.phaseTime += dt;
 if (game.phase === 'waiting') return;
 if (game.phase === 'countdown' || game.phase === 'finished') return;
 game.extraWater += (game.targetExtra - game.extraWater) * Math.min(1, dt *.7);
 game.water = waterLevel(game.phaseTime, game.extraWater, game.endless);
 if(game.endless&&game.players[0]) {
 const course=courseFor(game.players[0].y);
 if(course!==game.course) {
 const previous=new Map(game.enemies.map(e=>[e.id,e]));
 game.enemies=createHazards(course.enemyPosts).enemies.map(e=>previous.get(e.id)||e);
 game.course=course;
 }
 }
 for (const p of game.players) {
 if (!p.alive || p.waiting) continue;
 if (p.bot) p.input = botInput(game, p);
 stepPlayer(game, p, dt);
 }
 if(!game.endless)collidePlayers(game);
 stepHazards(game,dt);
 // Player collisions can push feet into a wave after movement was resolved.
 for (const p of game.players) if (p.alive && !p.waiting && touchesWater(game, p)) {
 p.alive = false; p.anchor = null; p.outAt = game.phaseTime; emit(game, 'out', { player: p.id, x: p.x, y: p.y });
 }
 const participants = game.entrants.filter(p => !p.waiting);
 const survivors = participants.filter(p => p.alive);
 if(game.endless) {
 if(!survivors.length) {
 const p=participants[0];
 game.result=p?{id:p.id,name:p.name,points:Math.max(0,Math.floor(WORLD.floor-WORLD.radius-p.bestY)),
 durationMs:Math.round((p.outAt??game.phaseTime)*1000),forfeited:p.forfeited}:null;
 game.finishReason='water';game.phase='finished';emit(game,'finish');
 }
 return;
 }
 for(const p of survivors)if(p.grounded && Math.abs(p.y+WORLD.radius-SUMMIT.y)<.1 && p.x>=SUMMIT.x && p.x<=SUMMIT.x+SUMMIT.w) {
 p.finishedAt ??= game.phaseTime;
 }
 if (survivors.some(p=>p.finishedAt!==null)) finishRound(game,'summit');
 else if (game.phaseTime >= WORLD.round) finishRound(game,'time');
 else if (game.phaseTime > 4 && survivors.length === 0) finishRound(game,'water');
 else if (game.phaseTime > 8 && participants.length > 1 && survivors.length === 1) finishRound(game,'last-player');
}

export function snapshot(game) {
 return { endless:game.endless, round: game.round, time: game.time, phase: game.phase, phaseTime: game.phaseTime,
 water: game.water, extraWater: game.extraWater, targetExtra: game.targetExtra,
 waveAt: game.waveAt, waveCount: game.waveCount, result: game.result, finishReason: game.finishReason,
 events: game.events, enemies:game.enemies, projectiles:game.projectiles, players: game.players.map(p => ({
 id: p.id, name: p.name, bot: p.bot, x: p.x, y: p.y, vx: p.vx, vy: p.vy, bestY:p.bestY,
 alive: p.alive, waiting: p.waiting, grounded: p.grounded, anchor: p.anchor,
 facing: p.facing, stun: p.stun, hitGrace:p.hitGrace, wins: p.wins, drown: p.drown, finishedAt: p.finishedAt
 })) };
}
