import { centerline, coursePoint, halfRoad } from './track.js';
import { finish } from './race.js';

export const mushroomColor = '#f46565';
export const mushroomTopSpeed = 27;
export const bananaColor = '#f9e753';
export const bananaSpinTime = 0.82;
const itemRules = [
  { type: 'mushroom', initial: 9, max: 17, interval: 1.25, jitter: 1, lifetime: 29 },
  { type: 'banana', initial: 2, max: 5, interval: 5, jitter: 3, lifetime: 24 },
];

function applyItem(item, car) {
  if (item.type === 'banana') {
    car.spinTime = bananaSpinTime;
    car.speed *= 0.48;
    car.boostTime = 0;
    car.driftDirection = 0;
    car.charge = 0;
    car.surface = 'BANANA SPIN';
    car.surfaceColor = bananaColor;
  } else {
    if (car.boostTime > 0 && car.boostColor !== mushroomColor) return;
    car.boostTime = Math.max(car.boostTime, 1.2);
    car.boostColor = mushroomColor;
    if (car.speed >= 0) car.speed = Math.max(car.speed, Math.min(25.5, car.speed + 1.4));
    car.surface = 'MUSHROOM BOOST';
    car.surfaceColor = mushroomColor;
  }
}

export function createTrackItems(random = Math.random) {
  let items = [];
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

  function update(now, cars) {
    items = items.filter(item => {
      if (item.expires <= now) return false;
      let winner;
      let nearest = item.type === 'banana' ? 1.8 : 2.15;
      for (const car of cars) {
        if (car.finishedAt !== null) continue;
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
  return { update };
}
