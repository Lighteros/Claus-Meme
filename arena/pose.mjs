import { PLATFORMS } from '../shared/course.mjs';

// Read once from the cached limb masks. These are the visible feet, not guessed tips.
export function footOutline(image) {
 const { data, width, height } = image, scale = 1024 / width, points = [];
 for (let x = 0; x < width; x++) for (let y = height - 1; y >= 0; y--) {
 if (data[(y * width + x) * 4 + 3] < 128) continue;
 points.push([x * scale, (y + 1) * scale], [(x + 1) * scale, (y + 1) * scale]);
 break;
 }
 return points;
}

export function limbMotions(pose, limbs) {
 const air = pose.grounded ? 0 : pose.air;
 return limbs.map((limb, i) => {
 const phase = pose.phase + limb.phase;
 const angle = Math.sin(phase) *.16 * pose.move + (i === 0 ? -.18 : i === 2 ?.18 : 0) * air;
 const y = (i === 0 ? 45 : i === 2 ? 60 : 0) * pose.move
 - Math.max(0, Math.cos(phase)) * 48 * pose.move - 42 * air;
 return { angle, y, cos: Math.cos(angle), sin: Math.sin(angle) };
 });
}

export function movedFoot(point, limb, motion) {
 const x = point[0] - limb.root[0], y = point[1] - limb.root[1];
 const cos = motion.cos ?? Math.cos(motion.angle), sin = motion.sin ?? Math.sin(motion.angle);
 return [limb.root[0] + x * cos - y * sin, limb.root[1] + x * sin + y * cos + motion.y];
}

// Use the same upper polygon edges as the course, including ramps and steps.
export function surfaceBelow(x, footY, platforms = PLATFORMS) {
 let top = Infinity;
 for (const platform of platforms) {
 if (x < platform.x || x > platform.x + platform.w || platform.y > footY + 28 || platform.y + platform.h < footY - 28) continue;
 for (const polygon of platform.parts) for (let i = 0; i < polygon.length; i++) {
 const a = polygon[i], b = polygon[(i + 1) % polygon.length];
 if (b[0] <= a[0] || x < a[0] || x > b[0]) continue;
 const y = a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]);
 if (Math.abs(y - footY) <= 28) top = Math.min(top, y);
 }
 }
 return top;
}

export function plantedShift(limbs, motions, { x, footY, size, flip }, platforms = PLATFORMS) {
 const scale = size / 1024;
 const nearby = platforms.filter(p => p.x < x + size / 2 && p.x + p.w > x - size / 2
 && p.y <= footY + 28 && p.y + p.h >= footY - 28);
 let shift = Infinity;
 limbs.forEach((limb, i) => {
 for (const point of limb.outline) {
 const [px, py] = movedFoot(point, limb, motions[i]);
 const worldX = x + flip * (px - 512) * scale;
 const floor = surfaceBelow(worldX, footY, nearby);
 if (Number.isFinite(floor)) shift = Math.min(shift, (floor - footY) / scale + 870 - py);
 }
 });
 return Number.isFinite(shift) ? shift : 0;
}

export function moveHand(hand, root, anchor, dt) {
 if (anchor) {
 const reach = Math.max(0, Math.min(1, anchor.reach ?? 1));
 // Once attached the fingertip is fixed to the ledge, even while the body moves.
 return { x: root.x + (anchor.x - root.x) * reach, y: root.y + (anchor.y - root.y) * reach };
 }
 if (!hand) return null;
 const blend = 1 - Math.exp(-dt * 26);
 const next = { x: hand.x + (root.x - hand.x) * blend, y: hand.y + (root.y - hand.y) * blend };
 return Math.hypot(next.x - root.x, next.y - root.y) < 3 ? null : next;
}
