import { STEP, cleanInput, emptyInput, stepPlayer, waterLevel } from '../shared/game.mjs';
import { courseFor } from '../shared/course.mjs';

// This is only a drawing prediction. The server still owns position, hits,
// deaths and results. Replay unacknowledged controls with the same collisions.
export class MovementPreview {
  constructor() { this.oneWay = 25; this.reset(); }

  reset() { this.state = null; this.history = []; this.received = 0; this.key = ''; }

  latency(roundTrip) {
    if (!Number.isFinite(roundTrip) || roundTrip < 0 || roundTrip > 2000) return;
    this.oneWay += (Math.min(125, roundTrip / 2) - this.oneWay) * .3;
  }

  input(input, at, sequence) {
    this.history.push({ input: cleanInput(input), at, sequence });
    // The server caps input rate; retain a bounded history even during an outage.
    if (this.history.length > 90) this.history.shift();
  }

  receive(state, ownId, now) {
    const key = `${ownId}:${state.round}`;
    if (key !== this.key) { this.history = []; this.key = key; }
    this.state = state; this.ownId = ownId; this.received = now;
    this.history = this.history.filter(event => event.sequence > (state.self?.sequence ?? 0));
  }

  sample(now) {
    const state = this.state, original = state?.players.find(player => player.id === this.ownId);
    if (!original?.alive || original.waiting || state.phase !== 'playing' || !state.self) return original;
    const self = state.self;
    const player = { ...original, ...self, anchor: original.anchor ? { ...original.anchor } : null,
      bestY: original.y, input: cleanInput(self.input || emptyInput()) };
    const game = { ...state, players: [player], events: [], eventId: 0 };
    // Keep lost connections still. Never invent seconds of movement or results.
    const start = this.received - this.oneWay;
    const end = Math.min(now, this.received + 150);
    let at = start;
    const advance = until => {
      while (at < until - .001 && player.alive) {
        const dt = Math.min(STEP, (until - at) / 1000);
        at += dt * 1000; game.time += dt; game.phaseTime += dt;
        game.extraWater += (game.targetExtra - game.extraWater) * Math.min(1, dt * .7);
        game.water = waterLevel(game.phaseTime, game.extraWater,game.endless);
        if(game.endless)game.course=courseFor(player.y);
        stepPlayer(game, player, dt);
      }
      at = until;
    };
    for (const event of this.history) {
      if (event.at > end) break;
      advance(Math.max(at, event.at)); player.input = event.input;
    }
    advance(end);
    // A local estimate never removes a player before the authoritative death.
    return { ...player, alive: original.alive };
  }
}
