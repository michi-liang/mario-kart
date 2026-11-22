import { halfRoad, wallOffset } from './track.js';
import { roadTopSpeed } from './race.js';

export const mushroomColor = '#f46565';
export const goldenMushroomColor = '#ffce55';
export const goldenMushroomSeconds = 6.5;
export const mushroomTopSpeed = roadTopSpeed * 1.25;
export const bulletTopSpeed = 40;
export const bananaSpinTime = 0.82;
export const itemInfo = {
  banana: { label: 'Banana', color: '#f9e753', icon: 'banana', uses: 1 },
  green: { label: 'Green shell', color: '#83f879', icon: '◆', uses: 1 },
  red: { label: 'Red shell', color: '#ff777a', icon: '◆', uses: 1 },
  mushroom: { label: 'Red mushroom', color: mushroomColor, icon: '🍄', uses: 1 },
  bomb: { label: 'Walking bomb', color: '#b4c6eb', icon: '💣', uses: 1 },
  blue: { label: 'Blue shell', color: '#75adff', icon: '◆', uses: 1 },
  fire: { label: 'Fireball', color: '#ffae54', icon: '🔥', uses: 3 },
  boomerang: { label: 'Boomerang', color: '#ffd28c', icon: '🪃', uses: 3 },
  blast: { label: 'Boom box', color: '#ff8cce', icon: '♫', uses: 1 },
  gold: { label: 'Golden Mushroom', color: goldenMushroomColor, icon: 'gold', uses: 1 },
  bullet: { label: 'Bullet Bill', color: '#94bcff', icon: 'bullet', uses: 1 },
  star: { label: 'Rainbow Star', color: '#ffed71', icon: 'star', uses: 1 },
  ghost: { label: 'Ink Ghost', color: '#d5b6ff', icon: 'ghost', uses: 1 },
  plant: { label: 'Chomper Plant', color: '#97ef89', icon: 'plant', uses: 1 },
};

// Interpolate between four points on the grid so each place has its own odds.
const rankWeights = [
  [37, 34, 11, 0, 0, 0, 0, 0, 14, 0, 0, 0, 0, 4],
  [9, 13, 18, 18, 5, 3, 4, 7, 5, 3, 1, 2, 4, 8],
  [1, 5, 10, 2, 4, 11, 6, 8, 4, 11, 10, 9, 8, 11],
  [0, 1, 3, 1, 2, 14, 1, 2, 1, 14, 22, 17, 10, 12],
];
const rankBreaks = [0, 3 / 11, 6 / 11, 1];
const itemTypes = Object.keys(itemInfo);
const soloWeights = itemTypes.map((_, index) => rankWeights.reduce((sum, row) => sum + row[index], 0));
const rollSeconds = 190 / 60;
const wallClearance = wallOffset - 0.65;
const heldShields = new Set(['red', 'green', 'banana']);

export function rollItem(place, fieldSize, random = Math.random) {
  const rank = (place - 1) / Math.max(1, fieldSize - 1);
  const upper = rankBreaks.findIndex((limit, index) => index > 0 && rank <= limit);
  const lower = upper - 1;
  const blend = (rank - rankBreaks[lower]) / (rankBreaks[upper] - rankBreaks[lower]);
  const weights = fieldSize < 2 ? soloWeights :
    rankWeights[lower].map((weight, i) => weight + (rankWeights[upper][i] - weight) * blend);
  let ticket = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (const [index, weight] of weights.entries()) {
    if (ticket < weight) return itemTypes[index];
    ticket -= weight;
  }
  return 'mushroom';
}

export function rearThreat(car, objects) {
  if (car.finishedAt !== null || car.flight || car.powerTime > 0) return null;
  const forwardX = Math.sin(car.yaw);
  const forwardZ = Math.cos(car.yaw);
  let best = null;
  let earliest = 1.6;
  for (const item of objects) {
    if (item.owner === car.number || item.hits?.has(car.number)) continue;
    const x = item.x - car.x;
    const z = item.z - car.z;
    const behind = -(x * forwardX + z * forwardZ);
    if (behind < 1 || behind > 72) continue;
    const { vx = 0, vz = 0 } = item;
    const forwardSpeed = vx * forwardX + vz * forwardZ;
    const closingSpeed = forwardSpeed - car.speed;
    if (forwardSpeed <= 1 || closingSpeed <= 1) continue;
    const time = behind / closingSpeed;
    if (time >= earliest) continue;
    const across = x * forwardZ - z * forwardX;
    const projectedAcross = across + (vx * forwardZ - vz * forwardX) * time;
    const radius = item.type === 'blue' || item.type === 'bomb' ? 6.5 : 3.8;
    if (Math.abs(projectedAcross) > radius) continue;
    earliest = time;
    best = { type: item.type, side: across < -1.8 ? 'left' : across > 1.8 ? 'right' : 'center' };
  }
  return best;
}

function spinOut(car, type, duration = bananaSpinTime) {
  if (car.spinTime > 0 || car.finishedAt !== null || car.powerTime > 0) return;
  if ((type === 'red' || type === 'green') && heldShields.has(car.item)) {
    car.item = null;
    car.itemUses = 0;
    return;
  }
  const { label, color } = itemInfo[type];
  car.spinTime = duration;
  car.speed *= 0.48;
  car.boostTime = 0;
  car.driftDirection = 0;
  car.charge = 0;
  car.spinLabel = label.toUpperCase();
  car.spinColor = color;
}

function boostMushroom(car, color) {
  car.boostColor = color;
  car.boostTime = Math.max(car.boostTime, 1.2);
  car.speed = Math.min(mushroomTopSpeed, Math.max(car.speed + 4, mushroomTopSpeed * 0.88));
  car.boostCount = (car.boostCount ?? 0) + 1;
}

function contactDistance(item, target, radius) {
  const x = target.x - item.x;
  const z = target.z - item.z;
  const along = x * item.dx + z * item.dz;
  const across = x * item.dz - z * item.dx;
  const reach = radius ** 2 - across ** 2;
  if (reach < 0) return Infinity;
  const intersect = Math.sqrt(reach);
  return along + intersect < 0 ? Infinity : Math.max(0, along - intersect);
}

function firstTarget(item, cars, travel, radius = 1.6, bananas = [], removed) {
  let target = null;
  let firstHit = travel;
  for (const car of cars) {
    if (car.number === item.owner || car.finishedAt !== null || item.hits?.has(car.number)) continue;
    const entry = contactDistance(item, car, radius);
    if (entry > firstHit) continue;
    firstHit = entry;
    target = car;
  }
  for (const banana of bananas) {
    if (removed.has(banana)) continue;
    const entry = contactDistance(item, banana, 1.25);
    if (entry > firstHit) continue;
    firstHit = entry;
    target = banana;
  }
  return target === null ? null : { target, distance: firstHit };
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

function stopAtImpact(hit, type, removed, duration) {
  if (hit.target.type === 'banana') removed.add(hit.target);
  else spinOut(hit.target, type, duration);
}

function bounce(track, item, cars, travel, bananas, removed) {
  for (let i = 0; i < 4 && travel > 0.001; i++) {
    const wall = wallDistance(track, item, travel);
    const distance = wall ?? travel;
    const hit = firstTarget(item, cars, distance, 1.6, bananas, removed);
    if (hit) {
      stopAtImpact(hit, item.type, removed, item.type === 'fire' ? 0.55 : 0.9);
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
    const sphere = type === 'blue';
    effects.push({ id: nextId++, type: sphere ? 'sphere' : 'wave', x, z, radius, born: now,
      color: itemInfo[type].color, expires: now + (sphere ? 0.58 : 0.4) });
    for (const car of cars) {
      if (car.number !== owner && Math.hypot(car.x - x, car.z - z) <= radius) spinOut(car, type, 1.15);
    }
    if (shield) clearObjects(cars, item => Math.hypot(item.x - x, item.z - z) <= radius);
  }

  function clearObjects(cars, shouldRemove) {
    objects = objects.filter(item => {
      if (!shouldRemove(item)) return true;
      if (item.type === 'boomerang') {
        const owner = cars.find(car => car.number === item.owner);
        if (owner) owner.boomerangOut = false;
      }
      return false;
    });
  }

  function use(car, now, positions, backwards = false) {
    if (car.finishedAt !== null || car.spinTime > 0) return;
    if (car.roulette) {
      if (now - car.roulette.start >= 1) car.roulette.end = now;
      return;
    }
    const type = car.item;
    if (!type || now < car.nextItemUse || car.boomerangOut || car.powerTime > 0) return;
    if (type === 'gold') {
      if (!car.goldUntil) car.goldUntil = now + goldenMushroomSeconds;
      if (now >= car.goldUntil) return;
      car.nextItemUse = now + 0.48;
      boostMushroom(car, goldenMushroomColor);
      return;
    }
    car.itemUses--;
    if (!car.itemUses) car.item = null;
    car.nextItemUse = now + 0.22;
    if (type === 'mushroom') {
      boostMushroom(car, mushroomColor);
      return;
    }
    if (type === 'ghost') {
      for (const [index, rival] of positions.entries()) {
        if (rival === car || rival.finishedAt !== null || rival.powerTime > 0) continue;
        const rank = index / Math.max(1, positions.length - 1);
        rival.inkUntil = Math.max(rival.inkUntil ?? 0, now + 6 - 4.4 * rank);
      }
      return;
    }
    if (type === 'plant') {
      car.plantUntil = now + 6;
      car.nextChompAt = now;
      return;
    }
    if (type === 'bullet' || type === 'star') {
      car.power = type;
      car.powerTime = type === 'bullet' ? 5 : 7;
      car.bulletProgress = null;
      car.driftDirection = 0;
      car.charge = 0;
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
      item.expires = now + 3.4;
      car.boomerangOut = true;
    }
    objects.push(item);
  }

  function updateObject(item, now, positions, dt, bananas, removed) {
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
      const returning = age > 0.82;
      if (now >= item.expires || (returning && Math.hypot(owner.x - x, owner.z - z) < 2.2)) {
        owner.boomerangOut = false;
        return false;
      }
      if (returning) aim(item, owner.x, owner.z, 13, dt);
      const travel = (returning ? 48 : 42) * dt;
      const hit = firstTarget(item, positions, travel)?.target;
      if (hit) {
        item.hits.add(hit.number);
        spinOut(hit, type, 0.65);
      }
      item.x += item.dx * travel;
      item.z += item.dz * travel;
      return true;
    }
    if (now >= item.expires) return false;
    if (type === 'green' || type === 'fire') {
      return bounce(track, item, positions, (type === 'green' ? 42 : 37) * dt, type === 'green' ? bananas : [], removed);
    }
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
      const hit = target && firstTarget(item, [target], travel, 2.7);
      for (const banana of bananas) {
        if (!removed.has(banana) && contactDistance(item, banana, 1.25) <= (hit?.distance ?? travel)) {
          removed.add(banana);
        }
      }
      if (hit) {
        blast(type, item.owner, target.x, target.z, now, positions, 6.5);
        return false;
      }
    } else {
      const wall = wallDistance(track, item, travel);
      const hit = firstTarget(item, positions, wall ?? travel, 1.6, bananas, removed);
      if (hit) stopAtImpact(hit, type, removed, 1);
      if (wall !== null || hit) return false;
    }
    item.x += item.dx * travel;
    item.z += item.dz * travel;
    return true;
  }

  function update(now, positions, dt) {
    effects = effects.filter(effect => effect.expires > now);
    const bananas = objects.filter(item => item.type === 'banana' && item.landAt <= now && item.expires > now);
    const removed = new Set();
    objects = objects.filter(item => {
      if (removed.has(item)) return false;
      // Resolve shells before checking whether a landed peel trips a kart.
      if (item.type === 'banana' && item.landAt <= now && item.expires > now) return true;
      const { x, z } = item;
      const active = updateObject(item, now, positions, dt, bananas, removed);
      item.vx = (item.x - x) / dt;
      item.vz = (item.z - z) / dt;
      return active;
    });
    if (bananas.length) {
      objects = objects.filter(item => !removed.has(item) &&
        (item.type !== 'banana' || item.landAt > now || updateObject(item, now, positions, dt, bananas, removed)));
    }
    for (const [index, car] of positions.entries()) {
      if (car.plantUntil > now && now >= car.nextChompAt && car.finishedAt === null && car.spinTime <= 0) {
        car.nextChompAt = now + 0.8;
        car.chompAt = now;
        const dx = Math.sin(car.yaw), dz = Math.cos(car.yaw);
        const inBite = target => {
          const x = target.x - car.x, z = target.z - car.z;
          return x * dx + z * dz > 0 && x * x + z * z < 5.5 ** 2 && Math.abs(x * dz - z * dx) < 2.6;
        };
        for (const rival of positions) {
          if (Math.abs((rival.flight?.y ?? 0) - (car.flight?.y ?? 0)) < 1.8 && inBite(rival)) {
            spinOut(rival, 'plant', 0.6);
          }
        }
        if (!car.flight) clearObjects(positions, item => inBite(item));
        if (car.boostTime <= 0 && car.speed >= 4 && !car.flight) {
          car.boostColor = itemInfo.plant.color;
          car.boostTime = 0.3;
          car.speed = Math.min(30, car.speed + 3);
        }
      }
      if (car.goldUntil && now >= car.goldUntil) {
        car.goldUntil = 0;
        car.item = null;
        car.itemUses = 0;
      }
      if (car.powerTime > 0 && car.finishedAt === null) {
        const height = car.flight?.y ?? track.profile(car.z, car.x).y;
        for (const rival of positions) {
          if (rival === car || Math.hypot(rival.x - car.x, rival.z - car.z) > 1.75) continue;
          const rivalHeight = rival.flight?.y ?? track.profile(rival.z, rival.x).y;
          if (Math.abs(height - rivalHeight) < 1.75) spinOut(rival, car.power);
        }
      }
      if (car.finishedAt !== null || car.flight?.y > 2.5) continue;
      if (car.roulette && now >= car.roulette.end) {
        car.item = car.roulette.item;
        car.itemUses = itemInfo[car.item].uses;
        car.nextItemUse = now + (car.bot ? 0.85 : 0.05);
        car.roulette = null;
      }
      if (car.item || car.roulette || car.boomerangOut || car.spinTime > 0 || car.powerTime > 0 || car.plantUntil > now) continue;
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
