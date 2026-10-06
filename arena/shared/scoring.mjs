export const PODIUM_POINTS = Object.freeze([100, 70, 50, 40, 35, 30, 25, 20, 15, 10]);
export const pointsForPlace = place => Number.isInteger(place) && place > 0 ? (PODIUM_POINTS[place - 1] ?? 5) : 0;

export function rankPlayers(players) {
  const eligible = players.filter(p => !p.waiting);
  const finished = p => p.alive && Number.isFinite(p.finishedAt);
  const category = p => p.forfeited ? 3 : p.participated === false ? 2 : finished(p) ? -1 : p.alive ? 0 : 1;
  eligible.sort((a, b) => category(a) - category(b) ||
    (finished(a) && finished(b) ? a.finishedAt-b.finishedAt : a.alive && b.alive ? a.y - b.y : (b.outAt ?? 0) - (a.outAt ?? 0)) || a.id.localeCompare(b.id));
  let place = 0, group = null;
  return eligible.map((p, i) => {
    const tied = group && category(p) === category(group) && !p.forfeited &&
      (finished(p) ? p.finishedAt===group.finishedAt : p.alive ? Math.abs(p.y - group.y) <= 2 : p.outAt === group.outAt);
    if (!tied) { place = i + 1; group = p; }
    return { id: p.id, name: p.name, place, points: p.forfeited || p.participated === false ? 0 : pointsForPlace(place),
      status: p.forfeited ? 'left' : p.participated === false ? 'idle' : p.alive ? 'survived' : 'out', reachedSummit:finished(p) };
  });
}
