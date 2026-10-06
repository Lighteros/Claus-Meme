import { WORLD } from '../shared/course.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Exact critically damped spring step. Its response does not depend on frame rate.
function spring(position, velocity, target, speed, dt) {
  const offset = position - target, decay = Math.exp(-speed * dt);
  const travel = (velocity + speed * offset) * dt;
  return [target + (offset + travel) * decay, (velocity - speed * travel) * decay];
}

export class FollowCamera {
  constructor() { this.key = ''; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.lookX = 0; this.lookY = 0; }

  update(focus, width, height, dt, key, reduced = false, endless = false) {
    this.scale = Math.min(width / 460, Math.max(height / 720, width / 1000));
    this.viewWidth = width / this.scale;
    this.viewHeight = height / this.scale;
    this.offsetX = Math.max(0, (width - WORLD.width * this.scale) / 2);
    const maxX = Math.max(0, WORLD.width - this.viewWidth);
    // Leave enough space below the starting floor for the first jump to scroll too.
    const maxY = WORLD.height - this.viewHeight * .6;
    const minY = endless ? -Infinity : -70;
    const size = `${width}:${height}`, reset = this.key !== key || this.size !== size;
    if (reset) this.lookX = this.lookY = 0;
    const delta = clamp(dt, 0, .05), ease = 1 - Math.exp(-delta * 5);
    this.lookX += ((reduced ? 0 : clamp(focus.vx * .18, -65, 65)) - this.lookX) * ease;
    this.lookY += ((reduced ? 0 : clamp(focus.vy * .12, -75, 65)) - this.lookY) * ease;
    const targetX = clamp(focus.x + this.lookX - this.viewWidth * .5, 0, maxX);
    const targetY = clamp(focus.y + this.lookY - this.viewHeight * .64, minY, maxY);
    if (reset) {
      this.x = targetX; this.y = targetY; this.vx = this.vy = 0;
      this.lookX = this.lookY = 0; this.key = key; this.size = size;
    } else {
      [this.x, this.vx] = spring(this.x, this.vx, targetX, reduced ? 18 : 10, delta);
      [this.y, this.vy] = spring(this.y, this.vy, targetY, reduced ? 18 : 12, delta);
    }
    // Falling quickly must never outrun the camera, including a low landscape view.
    this.x = clamp(this.x, Math.max(0, focus.x - this.viewWidth * .84), Math.min(maxX, focus.x - this.viewWidth * .16));
    this.y = clamp(this.y, focus.y - this.viewHeight * .86, focus.y - this.viewHeight * .14);
    this.y = clamp(this.y, minY, maxY);
    return this;
  }
}
