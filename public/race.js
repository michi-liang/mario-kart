import { centerline, coursePoint, halfRoad, nearestRoad, startIndex, step, wallOffset } from './track.js';

export const finish = startIndex + 10;
export const countdownSeconds = 3;
export const wallClearance = wallOffset - 0.9;
const count = centerline.length;
const gates = Array.from({ length: 8 }, (_, i) => {
  const index = finish + Math.round(count * i / 8);
  const [x, , z] = coursePoint(index);
  const [rightX, , rightZ] = coursePoint(index, 1);
  return { x, z, rightX: rightX - x, rightZ: rightZ - z, offset: index - finish };
});
const courseOrder = Array.from({ length: count + 1 }, (_, i) => centerline[(finish + i) % count]);

export function resetProgress(car) {
  Object.assign(car, { lap: 0, checkpoint: 0, started: false, progress: 0, finishedAt: null });
}

export function advanceProgress(car, previousX, previousZ, elapsed, dt) {
  if (car.finishedAt !== null) return;
  const gate = gates[car.checkpoint];
  const along = (x, z) => -(x - gate.x) * gate.rightZ + (z - gate.z) * gate.rightX;
  const before = along(previousX, previousZ);
  const after = along(car.x, car.z);
  if (before < 0 && after >= 0) {
    const t = -before / (after - before);
    const x = previousX + (car.x - previousX) * t - gate.x;
    const z = previousZ + (car.z - previousZ) * t - gate.z;
    if (Math.abs(x * gate.rightX + z * gate.rightZ) < halfRoad + 1.2) {
      if (car.checkpoint === 0) {
        if (car.started) car.lap++;
        car.started = true;
      }
      car.checkpoint = (car.checkpoint + 1) % gates.length;
      if (car.lap === 3) car.finishedAt = elapsed - dt + t * dt;
    }
  }
  if (!car.started) {
    car.progress = -Math.hypot(car.x - gates[0].x, car.z - gates[0].z);
    return;
  }
  const from = gates[(car.checkpoint + gates.length - 1) % gates.length].offset;
  const to = car.checkpoint === 0 ? count : gates[car.checkpoint].offset;
  let nearest = Infinity;
  let offset = from;
  for (let i = from; i < to; i++) {
    const [x, , z] = courseOrder[i];
    const [nextX, , nextZ] = courseOrder[i + 1];
    const dx = nextX - x;
    const dz = nextZ - z;
    const t = Math.max(0, Math.min(1, ((car.x - x) * dx + (car.z - z) * dz) / (dx * dx + dz * dz)));
    const distance = (car.x - x - dx * t) ** 2 + (car.z - z - dz * t) ** 2;
    if (distance < nearest) {
      nearest = distance;
      offset = i + t;
    }
  }
  car.progress = car.lap * count + offset;
}

export function standings(cars) {
  return [...cars].sort((a, b) => {
    if (a.finishedAt !== null || b.finishedAt !== null) {
      return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) || a.number - b.number;
    }
    return b.progress - a.progress || a.number - b.number;
  });
}

export function catchUpFactor(car, leaderProgress, racerCount) {
  if (!car.started || car.finishedAt !== null || racerCount < 2) return 1;
  const metersBehind = Math.max(0, (leaderProgress - car.progress) * step);
  return 1 + 0.015 * Math.min(1, metersBehind / 160);
}

export function hitWall(car, previousX, previousZ) {
  const nearest = nearestRoad(car.x, car.z);
  if (nearest.distance <= wallClearance) return false;
  const scale = wallClearance / nearest.distance;
  const x = nearest.x + (car.x - nearest.x) * scale;
  const z = nearest.z + (car.z - nearest.z) * scale;
  const moved = Math.hypot(x - previousX, z - previousZ);
  car.x = x;
  car.z = z;
  if (moved < 0.035) car.speed = 0;
  else car.speed *= 0.69;
  car.driftDirection = 0;
  car.charge = 0;
  car.boostTime = 0;
  return true;
}
