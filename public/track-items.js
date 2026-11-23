import { halfRoad, wallOffset } from './track.js';
import { roadTopSpeed } from './race.js';

export const mushroomColor = '#f46565';
export const goldenMushroomColor = '#ffce55';
export const goldenMushroomSeconds = 6.5;
export const mushroomTopSpeed = roadTopSpeed * 1.25;
export const bulletTopSpeed = 40;
export const bulletScale = 1.48;
export const coinLimit = 10;
export const coinTossSeconds = 0.64;
const boxRespawnSeconds = 2.9;
const boxPickupRadius = 2.65;
const itemCapacity = 2;
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
  blast: { label: 'Boom box', color: '#ff5750', icon: '♫', uses: 1 },
  gold: { label: 'Golden Mushroom', color: goldenMushroomColor, icon: 'gold', uses: 1 },
  bullet: { label: 'Bullet Bill', color: '#94bcff', icon: 'bullet', uses: 1 },
  star: { label: 'Rainbow Star', color: '#ffed71', icon: 'star', uses: 1 },
  ghost: { label: 'Ink Ghost', color: '#d5b6ff', icon: 'ghost', uses: 1 },
  plant: { label: 'Chomper Plant', color: '#97ef89', icon: 'plant', uses: 1 },
  coin: { label: 'Coin', color: '#ffd65e', icon: 'coin', uses: 1 },
  tripleBanana: { label: 'Triple bananas', color: '#f9e753', icon: 'banana', uses: 3, projectile: 'banana' },
  tripleGreen: { label: 'Triple green shells', color: '#83f879', icon: 'shell', uses: 3, projectile: 'green' },
  tripleRed: { label: 'Triple red shells', color: '#ff777a', icon: 'shell', uses: 3, projectile: 'red' },
  shock: { label: 'Lightning', color: '#ebdcff', icon: 'shock', uses: 1 },
};

// Interpolate between four points on the grid so each place has its own odds.
const rankWeights = [
  [18, 21, 10, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 3, 34, 2, 2, 0, 0],
  [5, 8, 15, 12, 4, 3, 3, 6, 4, 3, 1, 2, 4, 7, 4, 6, 7, 6, 0],
  [1, 2, 7, 1, 4, 9, 5, 6, 3, 9, 9, 9, 7, 10, 0, 2, 4, 7, 5],
  [0, 0, 1, 0, 1, 13, 0, 1, 0, 13, 20, 16, 9, 11, 0, 0, 0, 3, 12],
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

export function incomingThreat(car, objects) {
  if (car.finishedAt !== null || car.flight || car.powerTime > 0) return null;
  const forwardX = Math.sin(car.yaw);
  const forwardZ = Math.cos(car.yaw);
  let best = null;
  let earliest = 1.6;
  for (const item of objects) {
    if (item.owner === car.number || item.hits?.has(car.number)) continue;
    const x = item.x - car.x;
    const z = item.z - car.z;
    const along = x * forwardX + z * forwardZ;
    if (Math.abs(along) < 1 || Math.abs(along) > 72) continue;
    const { vx = 0, vz = 0 } = item;
    const forwardSpeed = vx * forwardX + vz * forwardZ;
    const closingSpeed = (car.speed - forwardSpeed) * Math.sign(along);
    if (Math.hypot(vx, vz) <= 1 || closingSpeed <= 1) continue;
    const time = Math.abs(along) / closingSpeed;
    if (time >= earliest) continue;
    const across = x * forwardZ - z * forwardX;
    const projectedAcross = across + (vx * forwardZ - vz * forwardX) * time;
    const radius = item.type === 'blue' || item.type === 'bomb' ? 6.5 : 3.8;
    if (Math.abs(projectedAcross) > radius) continue;
    earliest = time;
    best = { id: item.id, type: item.type, front: along > 0,
      side: across < -1.8 ? 'left' : across > 1.8 ? 'right' : 'center' };
  }
  return best;
}

function spinOut(car, type, duration = bananaSpinTime) {
  if (car.spinTime > 0 || car.finishedAt !== null || car.powerTime > 0) return;
  const held = car.inventoryItems[0];
  if ((type === 'red' || type === 'green') && held && !held.roulette &&
      heldShields.has(itemInfo[held.type].projectile ?? held.type)) {
    if (--held.uses === 0) car.inventoryItems.shift();
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
  car.coinSpill = { x: car.x, z: car.z, yaw: car.yaw, route: car.roadRoute };
}

function collectCoins(car, count) {
  car.coins = Math.min(coinLimit, car.coins + count);
  car.coinCount++;
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
    if (item.route?.section === 3 && car.roadRoute?.section === 3 &&
        item.route !== car.roadRoute && Math.abs(item.z - car.z) > 0.35) continue;
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
  const insideRoad = distance => {
    const x = item.x + item.dx * distance, z = item.z + item.dz * distance;
    if (!track.routes) return track.roadDistance(x, z) < wallClearance;
    const road = track.nearestRoad(x, z, item.route);
    const rail = track.forkRail(x, z, road.route);
    return (rail?.distance ?? road.distance - road.width) < -0.45;
  };
  if (insideRoad(travel)) return null;
  let inside = 0;
  let outside = travel;
  for (let i = 0; i < 9; i++) {
    const middle = (inside + outside) / 2;
    if (insideRoad(middle)) inside = middle;
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
    const road = track.nearestRoad(item.x, item.z, item.route);
    const rail = track.forkRail?.(item.x, item.z, road.route);
    if (!rail && !(road.distance > 0)) return false;
    const nx = rail?.x ?? (item.x - road.x) / road.distance;
    const nz = rail?.z ?? (item.z - road.z) / road.distance;
    const dot = Math.max(0, item.dx * nx + item.dz * nz);
    item.dx -= 2 * dot * nx;
    item.dz -= 2 * dot * nz;
    const clearance = track.routes ? road.width - 0.49 : wallClearance - 0.04;
    if (rail) {
      item.z = rail.insideZ - nz * 0.08;
    } else {
      item.x = road.x + nx * clearance;
      item.z = road.z + nz * clearance;
    }
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
  let nextId = 0;
  const rows = track.itemRows.flatMap((fraction, rowIndex) => {
    const index = track.oneWay ? Math.round(track.finish * fraction) :
      track.finish + Math.round(track.count * fraction);
    return (track.routesAt?.(index) ?? [undefined]).map(route => {
      const width = track.widthAt(index, route);
      const boxes = [-0.76, -0.38, 0, 0.38, 0.76].map((lane, column) => {
        const [x, , z] = track.coursePoint(index, lane * width, 0, route);
        const double = column % 2 === rowIndex % 2 && column !== 2;
        return { id: nextId++, type: 'box', x, z, route, index, double, availableAt: 0 };
      });
      return { id: rowIndex, x: boxes[2].x, z: boxes[2].z, boxes };
    });
  });
  let objects = [];
  let effects = [];
  const coins = [];
  let droppedCoins = [];
  const coinCells = new Map();
  const coinCell = (x, z) => Math.floor(x / 12) + ',' + Math.floor(z / 12);
  function spillCoins(car, now) {
    const { x, z, yaw, route } = car.coinSpill;
    car.coinSpill = null;
    const count = Math.min(car.coins, 3);
    car.coins -= count;
    for (let i = 0; i < count; i++) {
      const angle = yaw + Math.PI / 3 + i * Math.PI * 2 / 3;
      const landingX = x + Math.sin(angle) * 2.35;
      const landingZ = z + Math.cos(angle) * 2.35;
      const road = track.nearestRoad(landingX, landingZ, route);
      const limit = track.widthAt(road.index, road.route) - 0.65;
      const ratio = Number.isFinite(road.distance) && road.distance > limit ? limit / road.distance : 1;
      droppedCoins.push({ id: nextId++, type: 'coin', x: road.x + (landingX - road.x) * ratio,
        z: road.z + (landingZ - road.z) * ratio, fromX: x, fromZ: z, route: road.route ?? route,
        dropAt: now, landAt: now + 0.34, expires: now + 9, owner: car.number });
    }
  }
  const existingBoxIndices = new Set(rows.flatMap(row => row.boxes.map(box => box.index)));
  const end = track.oneWay ? track.finish : track.finish + track.count;
  for (let index = track.finish * Number(!track.oneWay) + 44; index < end - 16; index += 23 + Math.floor(random() * 18)) {
    if (track.jumpGap?.(index) || [-2, -1, 0, 1, 2].some(offset => existingBoxIndices.has(index + offset))) continue;
    for (const route of track.routesAt?.(index) ?? [undefined]) {
      if (route?.deck && Math.min(index - route.start, route.end - index) < 28) continue;
      const pattern = random();
      const count = pattern < 0.46 ? 1 : pattern < 0.73 ? 2 : 3;
      const width = track.widthAt(index, route);
      let offset = (random() - 0.5) * width * 1.32;
      for (let coinIndex = 0; coinIndex < count; coinIndex++) {
        const station = index + coinIndex * (pattern > 0.84 ? 2 : 4 + Math.floor(random() * 4));
        if (station > end - 12 || (route && station >= route.end) ||
            track.jumpGap?.(station) || existingBoxIndices.has(station)) continue;
        if (coinIndex && pattern <= 0.84) offset = (random() - 0.5) * width * 1.32;
        const [x, , z] = track.coursePoint(station, offset, 0, route);
        if (track.jump && x > track.jump.launch - 5 && x < track.jump.landing + 3 &&
            Math.abs(z - track.jump.centerZ) < track.jump.halfSpan) continue;
        const coin = { id: nextId++, type: 'coin', x, z, route, index: station, availableAt: 0 };
        coins.push(coin);
        for (const dx of [-1.65, 1.65]) for (const dz of [-1.65, 1.65]) {
          const key = coinCell(x + dx, z + dz);
          if (!coinCells.has(key)) coinCells.set(key, new Set());
          coinCells.get(key).add(coin);
        }
      }
    }
  }

  function blast(type, owner, x, z, now, cars, radius) {
    const sphere = type === 'blue';
    effects.push({ id: nextId++, type: sphere ? 'sphere' : 'wave', x, z, radius, born: now,
      color: itemInfo[type].color, expires: now + (sphere ? 0.58 : 0.4) });
    for (const car of cars) {
      if (car.number !== owner && Math.hypot(car.x - x, car.z - z) <= radius) spinOut(car, type, 1.15);
    }
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
    const slot = car.inventoryItems[0];
    if (!slot || car.powerTime > 0) return;
    if (slot.roulette) {
      for (const { roulette } of car.inventoryItems) {
        if (roulette && now - roulette.start >= 1) roulette.end = now;
      }
      return;
    }
    const type = itemInfo[slot.type].projectile ?? slot.type;
    if (now < car.nextItemUse || car.boomerangOut) return;
    if (type === 'gold') {
      if (!car.goldUntil) car.goldUntil = now + goldenMushroomSeconds;
      if (now >= car.goldUntil) return;
      car.nextItemUse = now + 0.48;
      boostMushroom(car, goldenMushroomColor);
      car.itemUseCount++;
      return;
    }
    slot.uses--;
    if (!slot.uses) car.inventoryItems.shift();
    car.itemUseCount++;
    car.nextItemUse = now + 0.22;
    if (type === 'coin') {
      car.coinTossAt = now;
      car.coinPayoutAt = now + coinTossSeconds;
      car.nextItemUse = car.coinPayoutAt;
      return;
    }
    if (type === 'mushroom') {
      boostMushroom(car, mushroomColor);
      return;
    }
    if (type === 'ghost') {
      for (const [index, rival] of positions.entries()) {
        if (rival === car || rival.finishedAt !== null || rival.powerTime > 0) continue;
        const rank = index / Math.max(1, positions.length - 1);
        if (rival.inkAt > now) continue;
        rival.inkAt = now + 1.02;
        rival.inkUntil = Math.max(rival.inkUntil, rival.inkAt + 6 - 4.4 * rank);
      }
      return;
    }
    if (type === 'plant') {
      car.plantUntil = now + 6;
      car.nextChompAt = now;
      return;
    }
    if (type === 'shock') {
      car.shockCount++;
      for (const rival of positions) {
        if (rival === car || rival.finishedAt !== null || rival.powerTime > 0) continue;
        spinOut(rival, type, 0.58);
        rival.shockUntil = now + 4;
        rival.coinSpill ??= { x: rival.x, z: rival.z, yaw: rival.yaw, route: rival.roadRoute };
      }
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
      effects.push({ id: nextId++, type: 'wave', x: car.x, z: car.z, owner: car.number, radius: 8,
        born: now, expires: now + 0.42, color: itemInfo.blast.color, hits: new Set() });
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
    const item = { id: nextId++, type, owner: car.number, x: clear ? x : car.x, z: clear ? z : car.z, route: car.roadRoute,
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
      const [aheadX, , aheadZ] = track.coursePoint(Math.floor(road.index) + 5, 0, 0, road.route);
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
    if (droppedCoins.length) droppedCoins = droppedCoins.filter(coin => coin.expires > now && !coin.collected);
    for (const wave of effects) {
      if (wave.owner === undefined) continue;
      const owner = positions.find(car => car.number === wave.owner);
      if (!owner) continue;
      const roadY = track.profile(owner.z, owner.x, owner.roadRoute).y;
      const height = owner.flight?.y ?? roadY + (owner.jumpHeight ?? 0);
      Object.assign(wave, { x: owner.x, z: owner.z, route: owner.roadRoute, lift: height - roadY });
      const radius = wave.radius * (0.28 + (now - wave.born) * 1.8);
      const within = target => Math.hypot(target.x - wave.x, target.z - wave.z) <= radius;
      for (const rival of positions) {
        if (rival === owner || wave.hits.has(rival.number) || !within(rival)) continue;
        const rivalHeight = rival.flight?.y ?? track.profile(rival.z, rival.x, rival.roadRoute).y + (rival.jumpHeight ?? 0);
        if (Math.abs(rivalHeight - height) > radius * 0.65) continue;
        wave.hits.add(rival.number);
        spinOut(rival, 'blast', 1.15);
      }
      clearObjects(positions, within);
    }
    const bananas = objects.filter(item => item.type === 'banana' && item.landAt <= now && item.expires > now);
    const removed = new Set();
    objects = objects.filter(item => {
      if (removed.has(item)) return false;
      // Resolve shells before checking whether a landed peel trips a kart.
      if (item.type === 'banana' && item.landAt <= now && item.expires > now) return true;
      const { x, z } = item;
      const active = updateObject(item, now, positions, dt, bananas, removed);
      if (track.routes && active) item.route = track.nearestRoad(item.x, item.z, item.route).route ?? item.route;
      item.vx = (item.x - x) / dt;
      item.vz = (item.z - z) / dt;
      return active;
    });
    if (bananas.length) {
      objects = objects.filter(item => !removed.has(item) &&
        (item.type !== 'banana' || item.landAt > now || updateObject(item, now, positions, dt, bananas, removed)));
    }
    for (const [index, car] of positions.entries()) {
      if (car.coinPayoutAt > 0 && now >= car.coinPayoutAt) {
        car.coinPayoutAt = 0;
        if (car.finishedAt === null) collectCoins(car, 2);
      }
      if (car.finishedAt === null && !car.flight && (car.jumpHeight ?? 0) < 1.7) {
        const nearby = coinCells.get(coinCell(car.x, car.z)) ?? [];
        for (const coin of droppedCoins.length ? [...nearby, ...droppedCoins] : nearby) {
          if (coin.collected || coin.availableAt > now || coin.landAt > now ||
              (coin.owner === car.number && now - coin.dropAt < 1.1) ||
              (coin.route && car.roadRoute && coin.route !== car.roadRoute) ||
              Math.hypot(coin.x - car.x, coin.z - car.z) > 1.65) continue;
          if (coin.dropAt !== undefined) coin.collected = true;
          else coin.availableAt = now + 10;
          collectCoins(car, 1);
        }
      }
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
        if (car.inventoryItems[0]?.type === 'gold') car.inventoryItems.shift();
      }
      if (car.powerTime > 0 && car.finishedAt === null) {
        const height = car.flight?.y ?? track.profile(car.z, car.x, car.roadRoute).y;
        const radius = car.power === 'bullet' ? 2.2 : 1.75;
        for (const rival of positions) {
          if (rival === car || Math.hypot(rival.x - car.x, rival.z - car.z) > radius) continue;
          const rivalHeight = rival.flight?.y ?? track.profile(rival.z, rival.x, rival.roadRoute).y;
          if (Math.abs(height - rivalHeight) < 1.75) spinOut(rival, car.power);
        }
      }
      if (car.finishedAt !== null) continue;
      for (const [seat, slot] of car.inventoryItems.entries()) {
        if (!slot.roulette || now < slot.roulette.end) continue;
        slot.roulette = null;
        car.itemReadyCount++;
        if (seat === 0) car.nextItemUse = Math.max(car.nextItemUse, now + (car.bot ? 0.85 : 0.05));
      }
      if (car.itemRow && Math.hypot(car.itemRow.x - car.x, car.itemRow.z - car.z) > halfRoad + boxPickupRadius) {
        car.itemRow = null;
      }
      if (car.inventoryItems.length >= itemCapacity || car.flight || (car.jumpHeight ?? 0) > 2.5 ||
          car.spinTime > 0 || car.powerTime > 0) continue;
      for (const row of rows) {
        if (row.id === car.itemRow?.id) continue;
        if (Math.hypot(row.x - car.x, row.z - car.z) > halfRoad + boxPickupRadius) continue;
        let box;
        let distance = boxPickupRadius;
        for (const candidate of row.boxes) {
          if (candidate.availableAt > now) continue;
          const gap = Math.hypot(candidate.x - car.x, candidate.z - car.z);
          if (gap >= distance) continue;
          distance = gap;
          box = candidate;
        }
        if (!box) continue;
        box.availableAt = now + boxRespawnSeconds;
        car.itemRow = row;
        car.itemBoxCount++;
        const count = Math.min(itemCapacity - car.inventoryItems.length, box.double ? 2 : 1);
        for (let i = 0; i < count; i++) {
          const type = rollItem(index + 1, positions.length, random);
          car.inventoryItems.push({ type, uses: itemInfo[type].uses, roulette: { start: now, end: now + rollSeconds } });
        }
        break;
      }
    }
    for (const car of positions) if (car.coinSpill) spillCoins(car, now);
  }

  return {
    update, use,
    boxes: rows.flatMap(row => row.boxes), coins,
    get droppedCoins() { return droppedCoins; },
    get objects() { return objects; },
    get effects() { return effects; },
  };
}
