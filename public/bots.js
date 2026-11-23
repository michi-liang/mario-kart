import { roadTopSpeed } from './race.js';

const headingError = (target, yaw) => Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
const paceBySeat = [0.98, 0.87, 1.04, 0.81, 0.94, 0.86, 1.02, 0.79, 0.91, 0.84, 0.99, 0.88];
export const botPace = number => paceBySeat[(number - 1) % paceBySeat.length];

export function botControls(track, car, road, pace) {
  const index = Math.floor(road.index);
  const style = Math.sin(car.number * 2.4);
  const lane = road.distance > 6 ? 0 : style * 2.4;
  const skill = botPace(car.number);
  const lookAhead = (car.speed > 16 ? 6 : 4) + (car.number % 4) - 1;
  const options = track.routesAt?.(index + lookAhead);
  const route = options?.length > 1 && index < options[0].start + 22
    ? options[(car.number - 1) % options.length] : road.route;
  const [x, , z] = track.coursePoint(index + lookAhead, lane, 0, route);
  const angle = headingError(Math.atan2(x - car.x, z - car.z), car.yaw);
  const [nearX, , nearZ] = track.coursePoint(index + 5, 0, 0, route);
  const [farX, , farZ] = track.coursePoint(index + 12, 0, 0, route);
  const curve = Math.abs(headingError(Math.atan2(farX - nearX, farZ - nearZ),
    Math.atan2(road.forwardX, road.forwardZ)));
  const topSpeed = roadTopSpeed * pace;
  const cornerPenalty = Math.max(0, curve - 0.12) * (10 + (1 - skill) * 24) + Math.max(0, Math.abs(angle) - 0.13) * 8;
  const desiredSpeed = Math.max(10, topSpeed - cornerPenalty);
  const fullThrottle = cornerPenalty === 0 || (car.boostTime > 0 && cornerPenalty < 4);
  return {
    steer: Math.max(-1, Math.min(1, angle * (2.15 + (skill - 0.90) * 2 + style * 0.12))),
    throttle: fullThrottle || car.speed < desiredSpeed ? 1 : 0,
    brake: car.speed > desiredSpeed + 3,
  };
}

export function useBotItem(car, positions, now) {
  const item = car.inventoryItems[0];
  if (!item || item.roulette || now < car.nextItemUse || now < car.botNextUse || car.boomerangOut ||
      car.powerTime > 0 || car.spinTime > 0 || car.finishedAt !== null) return false;
  const nearby = positions.filter(other => other !== car && other.finishedAt === null);
  const dx = Math.sin(car.yaw);
  const dz = Math.cos(car.yaw);
  const linedUp = nearby.some(other => {
    const x = other.x - car.x;
    const z = other.z - car.z;
    const forward = x * dx + z * dz;
    return forward > 1 && forward < 28 && Math.abs(x * dz - z * dx) < 4;
  });
  const rivalAhead = positions.slice(0, positions.indexOf(car)).some(other => other.finishedAt === null);
  const type = item.type === 'tripleBanana' ? 'banana' : item.type === 'tripleGreen' ? 'green' :
    item.type === 'tripleRed' ? 'red' : item.type;
  const useful = type === 'blast' ? nearby.some(other => Math.hypot(other.x - car.x, other.z - car.z) < 7)
    : type === 'blue' || type === 'red' ? rivalAhead
    : type === 'mushroom' || type === 'gold' ? car.speed > 12 && !car.wallContact
    : ['bullet', 'star', 'ghost', 'plant', 'coin', 'shock'].includes(type) ? !car.wallContact
    : type === 'banana' || linedUp;
  if (!useful && now < car.nextItemUse + 5.5 + (1.04 - botPace(car.number)) * 14) return false;
  car.botNextUse = now + 0.55 + (1.04 - botPace(car.number)) * 2.1;
  return true;
}
