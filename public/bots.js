import { roadTopSpeed } from './race.js';

const headingError = (target, yaw) => Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));

export function botControls(track, car, road, pace) {
  const index = Math.floor(road.index);
  const style = Math.sin(car.number * 2.4);
  const lane = road.distance > 6 ? 0 : style * 1.6;
  const lookAhead = (car.speed > 16 ? 6 : 4) + (car.number % 3) - 1;
  const [x, , z] = track.coursePoint(index + lookAhead, lane);
  const angle = headingError(Math.atan2(x - car.x, z - car.z), car.yaw);
  const [nearX, , nearZ] = track.coursePoint(index + 5);
  const [farX, , farZ] = track.coursePoint(index + 12);
  const curve = Math.abs(headingError(Math.atan2(farX - nearX, farZ - nearZ),
    Math.atan2(road.forwardX, road.forwardZ)));
  const topSpeed = roadTopSpeed * pace;
  const cornerPenalty = Math.max(0, curve - 0.12) * (10 + style * 1.4) + Math.max(0, Math.abs(angle) - 0.13) * 8;
  const desiredSpeed = Math.max(10, topSpeed - cornerPenalty);
  const fullThrottle = cornerPenalty === 0 || (car.boostTime > 0 && cornerPenalty < 4);
  return {
    steer: Math.max(-1, Math.min(1, angle * (2.3 - style * 0.16))),
    throttle: fullThrottle || car.speed < desiredSpeed ? 1 : 0,
    brake: car.speed > desiredSpeed + 3,
  };
}

export function useBotItem(car, positions, now) {
  if (!car.item || now < car.nextItemUse || now < car.botNextUse || car.boomerangOut ||
      car.spinTime > 0 || car.finishedAt !== null) return false;
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
  const useful = car.item === 'blast' ? nearby.some(other => Math.hypot(other.x - car.x, other.z - car.z) < 7)
    : car.item === 'blue' || car.item === 'red' ? rivalAhead
    : car.item === 'mushroom' || car.item === 'gold' ? car.speed > 12 && !car.wallContact
    : car.item === 'bullet' || car.item === 'star' ? !car.wallContact
    : car.item === 'banana' || linedUp;
  if (!useful && now < car.nextItemUse + 6.5 + (car.number % 4) * 0.45) return false;
  car.botNextUse = now + 0.62 + (car.number % 3) * 0.13;
  return true;
}
