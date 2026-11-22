import { halfRoad, wallOffset } from './track.js';

export const mushroomColor = '#f46565';
export const mushroomTopSpeed = 29;
export const bananaSpinTime = 0.82;
export const itemInfo = {
  banana: { label: 'Banana', color: '#f9e753', icon: '🍌', uses: 1 },
  green: { label: 'Green shell', color: '#83f879', icon: '◆', uses: 1 },
  red: { label: 'Red shell', color: '#ff777a', icon: '◆', uses: 1 },
  mushroom: { label: 'Red mushroom', color: mushroomColor, icon: '🍄', uses: 1 },
  bomb: { label: 'Walking bomb', color: '#b4c6eb', icon: '💣', uses: 1 },
  blue: { label: 'Blue shell', color: '#75adff', icon: '◆', uses: 1 },
  fire: { label: 'Fireball', color: '#ffae54', icon: '🔥', uses: 3 },
  boomerang: { label: 'Boomerang', color: '#ffd28c', icon: '🪃', uses: 3 },
  blast: { label: 'Boom box', color: '#ff8cce', icon: '♫', uses: 1 },
};

// Mario Kart 8 VS distance tables inform these four rank buckets. The weights
// are renormalized to the supported pool, with mushroom variants folded together.
const rankWeights = [
  [60, 50, 5, 0, 0, 0, 0, 0, 5],
  [15, 25, 45, 20, 10, 5, 10, 20, 10],
  [5, 15, 35, 55, 10, 2, 10, 5, 10],
  [0, 10, 18, 115, 0, 5, 5, 5, 0],
];
const itemTypes = Object.keys(itemInfo);
const soloWeights = itemTypes.map((_, index) => rankWeights.reduce((sum, row) => sum + row[index], 0));
const rollSeconds = 190 / 60;
const wallClearance = wallOffset - 0.65;

export function rollItem(place, fieldSize, random = Math.random) {
  const weights = fieldSize < 2 ? soloWeights : rankWeights[Math.round((place - 1) * 3 / (fieldSize - 1))];
  let ticket = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (const [index, weight] of weights.entries()) {
    if (ticket < weight) return itemTypes[index];
    ticket -= weight;
  }
  return 'mushroom';
}

function spinOut(car, type, duration = bananaSpinTime) {
  if (car.spinTime > 0 || car.finishedAt !== null) return;
  const { label, color } = itemInfo[type];
  car.spinTime = duration;
  car.speed *= 0.48;
  car.boostTime = 0;
  car.driftDirection = 0;
  car.charge = 0;
  car.spinLabel = label.toUpperCase();
  car.spinColor = color;
}

function firstTarget(item, cars, travel, radius = 1.6) {
  let target;
  let firstHit = travel;
  for (const car of cars) {
    if (car.number === item.owner || car.finishedAt !== null || item.hits?.has(car.number)) continue;
    const x = car.x - item.x;
    const z = car.z - item.z;
    const along = x * item.dx + z * item.dz;
    const across = x * item.dz - z * item.dx;
    const reach = radius ** 2 - across ** 2;
    if (reach < 0) continue;
    const intersect = Math.sqrt(reach);
    const entry = Math.max(0, along - intersect);
    if (along + intersect < 0 || entry > firstHit) continue;
    firstHit = entry;
    target = car;
  }
  return target;
}

function wallDistance(track, item, travel) {
  if (track.roadDistance(item.x + item.dx * travel, item.z + item.dz * travel) < wallClearance) return null;
  let inside = 0;
  let outside = travel;
  for (let i = 0; i < 9; i++) {
    const middle = (inside + outside) / 2;
    if (track.roadDistance(item.x + item.dx * middle, item.z + item.dz * middle) < wallClearance) inside = middle;
    else outside = middle;
  }
  return inside;
}

function bounce(track, item, cars, travel) {
  for (let i = 0; i < 4 && travel > 0.001; i++) {
    const wall = wallDistance(track, item, travel);
    const distance = wall ?? travel;
    const hit = firstTarget(item, cars, distance);
    if (hit) {
      spinOut(hit, item.type, item.type === 'fire' ? 0.55 : 0.9);
      return false;
    }
    item.x += item.dx * distance;
    item.z += item.dz * distance;
    if (wall === null) break;
    const road = track.nearestRoad(item.x, item.z);
    if (road.distance === 0) return false;
    const nx = (item.x - road.x) / road.distance;
    const nz = (item.z - road.z) / road.distance;
    const dot = Math.max(0, item.dx * nx + item.dz * nz);
    item.dx -= 2 * dot * nx;
    item.dz -= 2 * dot * nz;
    item.x = road.x + nx * (wallClearance - 0.04);
    item.z = road.z + nz * (wallClearance - 0.04);
    travel -= distance;
  }
  return true;
}

function aim(item, x, z, rate, dt) {
  const yaw = Math.atan2(item.dx, item.dz);
  const turn = Math.atan2(x - item.x, z - item.z) - yaw;
  const offset = Math.atan2(Math.sin(turn), Math.cos(turn));
  const next = yaw + Math.max(-rate * dt, Math.min(rate * dt, offset));
  item.dx = Math.sin(next);
  item.dz = Math.cos(next);
}

export function createTrackItems(track, random = Math.random) {
  const rows = track.itemRows.map((fraction, row) => {
    const index = track.finish + Math.round(track.count * fraction);
    const width = track.widthAt(index);
    const boxes = [-0.76, -0.38, 0, 0.38, 0.76].map((lane, column) => {
      const [x, , z] = track.coursePoint(index, lane * width);
      return { id: row * 5 + column, type: 'box', x, z, availableAt: 0 };
    });
    return { x: boxes[2].x, z: boxes[2].z, boxes };
  });
  let objects = [];
  let effects = [];
  let nextId = rows.length * 5;

  function blast(type, owner, x, z, now, cars, radius, shield = false) {
    effects.push({ id: nextId++, type: 'wave', x, z, radius, born: now,
      color: itemInfo[type].color, expires: now + 0.4 });
    for (const car of cars) {
      if (car.number !== owner && Math.hypot(car.x - x, car.z - z) <= radius) spinOut(car, type, 1.15);
    }
    if (shield) {
      objects = objects.filter(item => {
        if (Math.hypot(item.x - x, item.z - z) > radius) return true;
        if (item.type === 'boomerang') cars.find(car => car.number === item.owner).boomerangOut = false;
        return false;
      });
    }
  }

  function use(car, now, positions, backwards = false) {
    if (car.finishedAt !== null || car.spinTime > 0) return;
    if (car.roulette) {
      if (now - car.roulette.start >= 1) car.roulette.end = now;
      return;
    }
    const type = car.item;
    if (!type || now < car.nextItemUse || car.boomerangOut) return;
    car.itemUses--;
    if (!car.itemUses) car.item = null;
    car.nextItemUse = now + 0.22;
    if (type === 'mushroom') {
      car.boostColor = mushroomColor;
      car.boostTime = Math.max(car.boostTime, 1.2);
      car.speed = Math.max(0, car.speed) + 1.4;
      return;
    }
    if (type === 'blast') {
      blast(type, car.number, car.x, car.z, now, positions, 8, true);
      return;
    }
    const back = type === 'banana' && backwards;
    const dx = Math.sin(car.yaw) * (back ? -1 : 1);
    const dz = Math.cos(car.yaw) * (back ? -1 : 1);
    const ahead = [...positions.slice(0, positions.indexOf(car))].reverse().find(rival => rival.finishedAt === null);
    const offset = back ? 2.2 : 1.6;
    const x = car.x + offset * dx;
    const z = car.z + offset * dz;
    const clear = track.roadDistance(x, z) < wallClearance;
    const item = { id: nextId++, type, owner: car.number, x: clear ? x : car.x, z: clear ? z : car.z,
      dx, dz, born: now, target: ahead?.number, expires: now + (type === 'banana' ? 22 : 7) };
    if (type === 'banana') item.landAt = now + (back ? 0 : 0.52);
    if (type === 'bomb') item.expires = now + 2.7;
    if (type === 'boomerang') {
      item.hits = new Set();
      item.expires = now + 2.5;
      car.boomerangOut = true;
    }
    objects.push(item);
  }

  function updateObject(item, now, positions, dt) {
    const { type, x, z } = item;
    const age = now - item.born;
    if (type === 'bomb') {
      if (now >= item.expires || (age > 0.45 && firstTarget(item, positions, 0, 2.3))) {
        blast(type, item.owner, x, z, now, positions, 6);
        return false;
      }
      const travel = (age < 0.38 ? 18 : 4.2) * dt;
      if (wallDistance(track, item, travel) === null) {
        item.x += item.dx * travel;
        item.z += item.dz * travel;
      }
      return true;
    }
    if (type === 'boomerang') {
      const owner = positions.find(car => car.number === item.owner);
      const returning = age > 0.48;
      if (now >= item.expires || (returning && Math.hypot(owner.x - x, owner.z - z) < 2.2)) {
        owner.boomerangOut = false;
        return false;
      }
      if (returning) aim(item, owner.x, owner.z, 13, dt);
      const travel = (returning ? 48 : 42) * dt;
      const hit = firstTarget(item, positions, travel);
      if (hit) {
        item.hits.add(hit.number);
        spinOut(hit, type, 0.65);
      }
      item.x += item.dx * travel;
      item.z += item.dz * travel;
      return true;
    }
    if (now >= item.expires) return false;
    if (type === 'green' || type === 'fire') return bounce(track, item, positions, (type === 'green' ? 42 : 37) * dt);
    if (type === 'banana') {
      if (now < item.landAt) {
        const travel = 23 * dt;
        if (wallDistance(track, item, travel) === null) {
          item.x += item.dx * travel;
          item.z += item.dz * travel;
        }
        return true;
      }
      const hit = positions.find(car => car.finishedAt === null &&
        (car.number !== item.owner || now - item.landAt > 0.9) && Math.hypot(car.x - x, car.z - z) < 1.65);
      if (hit) spinOut(hit, type);
      return !hit;
    }
    const target = type === 'blue'
      ? positions.find(car => car.finishedAt === null && car.number !== item.owner)
      : positions.find(car => car.number === item.target && car.finishedAt === null);
    const road = track.nearestRoad(x, z);
    if (target && Math.hypot(target.x - x, target.z - z) < (type === 'blue' ? 19 : 12)) {
      aim(item, target.x, target.z, 12, dt);
    } else {
      const [aheadX, , aheadZ] = track.coursePoint(Math.floor(road.index) + 5);
      aim(item, aheadX, aheadZ, 7, dt);
    }
    const travel = (type === 'blue' ? 52 : 44) * dt;
    if (type === 'blue') {
      if (target && firstTarget(item, [target], travel, 2.7)) {
        blast(type, item.owner, target.x, target.z, now, positions, 6.5);
        return false;
      }
    } else {
      const wall = wallDistance(track, item, travel);
      const hit = firstTarget(item, positions, wall ?? travel);
      if (hit) spinOut(hit, type, 1);
      if (wall !== null || hit) return false;
    }
    item.x += item.dx * travel;
    item.z += item.dz * travel;
    return true;
  }

  function update(now, positions, dt) {
    effects = effects.filter(effect => effect.expires > now);
    objects = objects.filter(item => updateObject(item, now, positions, dt));
    for (const [index, car] of positions.entries()) {
      if (car.finishedAt !== null || car.flight?.y > 2.5) continue;
      if (car.roulette && now >= car.roulette.end) {
        car.item = car.roulette.item;
        car.itemUses = itemInfo[car.item].uses;
        car.nextItemUse = now + (car.bot ? 0.85 : 0.05);
        car.roulette = null;
      }
      if (car.item || car.roulette || car.boomerangOut || car.spinTime > 0) continue;
      for (const row of rows) {
        if (Math.hypot(row.x - car.x, row.z - car.z) > halfRoad + 2) continue;
        const box = row.boxes.find(box => box.availableAt <= now && Math.hypot(box.x - car.x, box.z - car.z) < 2.15);
        if (!box) continue;
        box.availableAt = now + 4;
        car.roulette = { start: now, end: now + rollSeconds, item: rollItem(index + 1, positions.length, random) };
        break;
      }
    }
  }

  return {
    update, use,
    boxes: rows.flatMap(row => row.boxes),
    get objects() { return objects; },
    get effects() { return effects; },
  };
}
