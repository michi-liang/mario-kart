import { centerline, coursePoint, halfRoad, nearestRoad, roadDistance, wallOffset } from './track.js';
import { finish } from './race.js';

export const mushroomColor = '#f46565';
export const mushroomTopSpeed = 27;
export const bananaColor = '#f9e753';
export const bananaSpinTime = 0.82;
export const shellColor = '#83f879';
const shellWallClearance = wallOffset - 0.65;
const itemRules = [
  { type: 'mushroom', initial: 9, max: 17, interval: 1.25, jitter: 1, lifetime: 29 },
  { type: 'banana', initial: 2, max: 5, interval: 5, jitter: 3, lifetime: 24 },
  { type: 'shell', initial: 4, max: 7, interval: 3, jitter: 2, lifetime: 30 },
];

function spinOut(car, label, color) {
  car.spinTime = bananaSpinTime;
  car.speed *= 0.48;
  car.boostTime = 0;
  car.driftDirection = 0;
  car.charge = 0;
  car.spinLabel = car.surface = label;
  car.spinColor = car.surfaceColor = color;
}

function applyItem(item, car) {
  if (item.type === 'banana') {
    spinOut(car, 'BANANA SPIN', bananaColor);
  } else if (item.type === 'shell') {
    car.hasShell = true;
  } else {
    if (car.boostTime > 0 && car.boostColor !== mushroomColor) return;
    car.boostTime = Math.max(car.boostTime, 1.2);
    car.boostColor = mushroomColor;
    if (car.speed >= 0) car.speed = Math.max(car.speed, Math.min(25.5, car.speed + 1.4));
    car.surface = 'MUSHROOM BOOST';
    car.surfaceColor = mushroomColor;
  }
}

function firstShellTarget(shell, cars, travel) {
  let target;
  let firstHit = travel;
  for (const car of cars) {
    if (car.number === shell.owner || car.finishedAt !== null) continue;
    const x = car.x - shell.x;
    const z = car.z - shell.z;
    const along = x * shell.dx + z * shell.dz;
    const across = x * shell.dz - z * shell.dx;
    const reach = 1.65 ** 2 - across ** 2;
    if (reach < 0) continue;
    const intersect = Math.sqrt(reach);
    const entry = Math.max(0, along - intersect);
    if (along + intersect < 0 || entry > firstHit) continue;
    firstHit = entry;
    target = car;
  }
  return target;
}

function shellWallDistance(shell, travel) {
  if (roadDistance(shell.x + shell.dx * travel, shell.z + shell.dz * travel) < shellWallClearance) return null;
  let inside = 0;
  let outside = travel;
  for (let i = 0; i < 10; i++) {
    const middle = (inside + outside) / 2;
    const distance = roadDistance(shell.x + shell.dx * middle, shell.z + shell.dz * middle);
    if (distance < shellWallClearance) inside = middle;
    else outside = middle;
  }
  return inside;
}

export function createTrackItems(random = Math.random) {
  let items = [];
  let shells = [];
  const schedules = itemRules.map(rule => ({ ...rule, nextSpawn: 0 }));
  let nextId = 0;

  function spawn(rule, now, cars) {
    const count = centerline.length;
    for (let attempt = 0; attempt < 14; attempt++) {
      // Keep the starting grid and the finish-line approach clear.
      const index = (finish + 16 + Math.floor(random() * (count - 36))) % count;
      const lane = Math.floor(random() * 3) - 1;
      const [x, , z] = coursePoint(index, lane * halfRoad * 0.52);
      if (items.some(item => Math.hypot(item.x - x, item.z - z) < 13) ||
          cars.some(car => Math.hypot(car.x - x, car.z - z) < 10)) continue;
      items.push({ id: nextId++, type: rule.type, x, z, expires: now + rule.lifetime });
      return;
    }
  }

  function throwShell(car, now) {
    if (!car.hasShell || car.finishedAt !== null || car.spinTime > 0) return;
    const dx = Math.sin(car.yaw);
    const dz = Math.cos(car.yaw);
    const x = car.x + dx * 1.55;
    const z = car.z + dz * 1.55;
    const roomAhead = roadDistance(x, z) < shellWallClearance;
    shells.push({ id: nextId++, type: 'shell', owner: car.number, moving: true,
      x: roomAhead ? x : car.x, z: roomAhead ? z : car.z, dx, dz, expires: now + 3 });
    car.hasShell = false;
  }

  function updateShells(now, cars, dt) {
    shells = shells.filter(shell => {
      if (shell.expires <= now) return false;
      let remaining = 42 * dt;
      // Resolve each straight segment in order, including the distance left after a bounce.
      for (let bounce = 0; bounce < 4 && remaining > 0.001; bounce++) {
        const wall = shellWallDistance(shell, remaining);
        const travel = wall ?? remaining;
        const target = firstShellTarget(shell, cars, travel);
        if (target) {
          spinOut(target, 'SHELL HIT', shellColor);
          return false;
        }
        shell.x += shell.dx * travel;
        shell.z += shell.dz * travel;
        if (wall === null) break;

        const nearest = nearestRoad(shell.x, shell.z);
        const nx = (shell.x - nearest.x) / nearest.distance;
        const nz = (shell.z - nearest.z) / nearest.distance;
        const outward = Math.max(0, shell.dx * nx + shell.dz * nz);
        shell.dx -= 2 * outward * nx;
        shell.dz -= 2 * outward * nz;
        shell.x = nearest.x + nx * (shellWallClearance - 0.03);
        shell.z = nearest.z + nz * (shellWallClearance - 0.03);
        remaining -= travel;
      }
      return true;
    });
  }

  function update(now, cars, dt = 0) {
    updateShells(now, cars, dt);
    items = items.filter(item => {
      if (item.expires <= now) return false;
      let winner;
      let nearest = item.type === 'banana' ? 1.8 : item.type === 'shell' ? 2.45 : 2.15;
      for (const car of cars) {
        if (car.finishedAt !== null) continue;
        if (item.type === 'shell' && car.hasShell) continue;
        const distance = Math.hypot(car.x - item.x, car.z - item.z);
        if (distance < nearest || (winner && distance === nearest && car.number < winner.number)) {
          nearest = distance;
          winner = car;
        }
      }
      if (!winner) return true;
      applyItem(item, winner);
      return false;
    });
    for (const rule of schedules) {
      if (now < rule.nextSpawn) continue;
      if (rule.nextSpawn === 0 && rule.type === 'shell') {
        const [x, , z] = coursePoint(finish + 5);
        items.push({ id: nextId++, type: rule.type, x, z, expires: now + rule.lifetime });
      }
      let active = items.filter(item => item.type === rule.type).length;
      const target = rule.nextSpawn === 0 ? rule.initial : Math.min(active + 1, rule.max);
      while (active < target) {
        const previousCount = items.length;
        spawn(rule, now, cars);
        if (items.length === previousCount) break;
        active++;
      }
      rule.nextSpawn = now + rule.interval + random() * rule.jitter;
    }
    return items;
  }
  return { update, throwShell, get shells() { return shells; } };
}
