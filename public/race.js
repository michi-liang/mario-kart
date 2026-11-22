import { wallOffset } from './track.js';

export const countdownSeconds = 3;
export const launchBoostColor = '#f8a14b';
export const kartScale = 0.56;
export const roadTopSpeed = 27;
export const grassSpeedFactor = 0.70;
export const hoverSpinSeconds = 0.64;
export const hoverBoostColor = '#6bf5e8';
export const trickBoostColor = '#ff945d';
export const trickBoostSpeed = 32;
export const trickSpinSeconds = 0.44;
export const hoverHopSeconds = 0.30;
export const wallClearance = wallOffset - 0.9 * kartScale;
const kartDiameter = 2.8 * kartScale;
const kartRestitution = 0.22;
const derived = new WeakMap();

export function launchFromGrid(car) {
  if (car.launchHold >= 2.15) {
    car.spinTime = 0.72;
    car.spinLabel = 'BURNOUT';
    car.spinColor = '#ff8c74';
    return 'burnout';
  }
  if (car.launchHold < 1.15) return '';
  car.boostTime = 0.92;
  car.boostColor = launchBoostColor;
  car.boostCount++;
  car.speed = 19;
  return 'boost';
}

// Checkpoint gates and the finish-ordered centerline depend only on the track,
// so build them once per track.
function course(track) {
  let data = derived.get(track);
  if (!data) {
    if (track.oneWay) {
      const gateIndexes = Array.from({ length: 8 }, (_, i) =>
        Math.round(track.finish * (i + 1) / 8));
      const gates = gateIndexes.map((index, checkpoint) => {
        const [x, , z] = track.coursePoint(index);
        const [rightX, , rightZ] = track.coursePoint(index, 1);
        return { x, z, rightX: rightX - x, rightZ: rightZ - z, offset: index, checkpoint };
      });
      data = { gates, order: track.centerline.slice(0, track.finish + 1) };
      derived.set(track, data);
      return data;
    }
    const { count, finish, coursePoint, centerline } = track;
    const gates = Array.from({ length: 8 }, (_, i) => {
      const index = finish + Math.round(count * i / 8);
      const [x, , z] = coursePoint(index);
      const [rightX, , rightZ] = coursePoint(index, 1);
      return { x, z, rightX: rightX - x, rightZ: rightZ - z, offset: index - finish };
    });
    const order = Array.from({ length: count + 1 }, (_, i) => centerline[(finish + i) % count]);
    data = { gates, order };
    derived.set(track, data);
  }
  return data;
}

export function resetProgress(car) {
  Object.assign(car, { lap: 0, checkpoint: 0, started: false, progress: 0, finishedAt: null, wrongWayTime: 0 });
}

export function recoveryPose(track, car) {
  if (!car.started && car.startPose) return car.startPose;
  let index = car.started ? track.finish + Math.floor(car.progress % track.count) : track.startIndex;
  const jump = track.jump;
  if (jump) {
    const [x, , z] = track.coursePoint(index);
    if (x >= jump.launch && x < jump.landing && Math.abs(z - jump.centerZ) < jump.halfSpan) {
      while (track.coursePoint(index)[0] >= jump.launch - 3) index--;
    }
  }
  const [x, , z] = track.coursePoint(index);
  const [aheadX, , aheadZ] = track.coursePoint(index + 1);
  return { x, z, yaw: Math.atan2(aheadX - x, aheadZ - z) };
}

export function offCourse(track, car, road) {
  if (car.flight) return false;
  const gap = track.jump;
  return road.distance > wallClearance + 0.05 || Boolean(gap &&
    car.x > gap.launch + 1 && car.x < gap.landing && Math.abs(car.z - gap.centerZ) < gap.halfSpan);
}

export function advanceBullet(track, car, road, speed, dt) {
  if (car.bulletProgress === null) {
    car.bulletProgress = road.index;
    car.bulletLane = (car.x - road.x) * road.forwardZ - (car.z - road.z) * road.forwardX;
  }
  car.bulletProgress = (car.bulletProgress + speed * dt / track.step) % track.count;
  car.bulletLane *= Math.exp(-4 * dt);
  const index = Math.floor(car.bulletProgress);
  const mix = car.bulletProgress - index;
  const [x, , z] = track.coursePoint(index, car.bulletLane);
  const [nextX, , nextZ] = track.coursePoint(index + 1, car.bulletLane);
  car.x = x + (nextX - x) * mix;
  car.z = z + (nextZ - z) * mix;
  const turn = Math.atan2(nextX - x, nextZ - z) - car.yaw;
  car.yaw += Math.atan2(Math.sin(turn), Math.cos(turn));
  car.speed = speed;
}

export function updateWrongWay(car, road, dt) {
  const forward = Math.sin(car.yaw) * road.forwardX + Math.cos(car.yaw) * road.forwardZ;
  const againstTraffic = Math.abs(car.speed) > 1.5 && forward * Math.sign(car.speed) < -0.5;
  car.wrongWayTime = againstTraffic && car.finishedAt === null ? car.wrongWayTime + dt : 0;
}

export function advanceHoverEntry(car, hover, dt) {
  car.hoverHop = Math.max(0, car.hoverHop - dt);
  if (hover < 0.04) car.hoverEntered = false;
  if (hover >= 0.12 && !car.hoverEntered) {
    car.hoverEntered = true;
    if (!car.flight) car.hoverHop = hoverHopSeconds;
  }
}

export function advanceGlider(track, car, previousX, dt, pitch = 0, trickTap = false) {
  const jump = track.jump;
  if (!jump) return;
  car.trickBuffer = trickTap ? 0.18 : Math.max(0, car.trickBuffer - dt);
  if (!car.flight && previousX < jump.launch && car.x >= jump.launch &&
      Math.abs(car.z - jump.centerZ) < jump.halfSpan) {
    car.flight = { y: jump.height, rise: 4.2, time: 0, pitch: 0 };
    car.speed = Math.max(24, car.speed);
    car.driftDirection = 0;
    car.charge = 0;
  }
  if (car.flight) {
    const flight = car.flight;
    if (flight.trickAt === undefined && flight.time <= 0.23 && car.trickBuffer > 0) {
      flight.trickAt = flight.time;
      flight.trickDirection = car.steering < -0.12 ? -1 : 1;
      car.trickCount++;
      car.trickBuffer = 0;
    }
    flight.time += dt;
    const open = flight.time > 0.26;
    flight.pitch += ((open ? pitch : 0) - flight.pitch) * (1 - Math.exp(-5 * dt));
    if (open) {
      // Diving builds speed. Pulling up uses that speed for lift, so a kart
      // can climb out of a dive but cannot keep climbing at low airspeed.
      const glideSpeed = 27 - flight.pitch * 10;
      const speedResponse = flight.pitch > 0 ? 0.85 : 1.25;
      car.speed += (glideSpeed - car.speed) * (1 - Math.exp(-speedResponse * dt));
      const pitchAuthority = flight.pitch < 0 ? 8 : Math.max(0, car.speed - 15) * 1.35;
      const verticalSpeed = -jump.sinkRate + flight.pitch * pitchAuthority;
      flight.rise += (verticalSpeed - flight.rise) * (1 - Math.exp(-3 * dt));
    } else {
      flight.rise -= 14 * dt;
    }
    flight.y += flight.rise * dt;
    const aboveDeck = car.x >= jump.landing && Math.abs(car.z - jump.centerZ) < jump.halfSpan;
    if (aboveDeck && flight.y <= track.profile(car.z, car.x).y) {
      car.flight = null;
      car.landingSquash = 1;
      car.speed = Math.min(31, car.speed);
      if (flight.trickAt !== undefined && flight.time - flight.trickAt >= trickSpinSeconds) {
        car.boostTime = 0.86;
        car.boostColor = trickBoostColor;
        car.boostCount++;
        car.speed = trickBoostSpeed;
      }
    } else if (flight.y <= 0) {
      // Recover a missed landing at the start of the catch deck.
      car.x = jump.landing + 2;
      car.z = jump.centerZ;
      car.yaw = Math.PI / 2;
      car.speed = 11;
      car.flight = null;
      car.landingSquash = 1;
    }
  }
  const target = car.flight && car.flight.time > 0.26 ? 1 : 0;
  car.glider += (target - car.glider) * (1 - Math.exp(-(target ? 6 : 9) * dt));
  car.landingSquash = Math.max(0, car.landingSquash - dt * 6);
}

export function advanceProgress(track, car, previousX, previousZ, elapsed, dt) {
  if (car.finishedAt !== null) return;
  const { gates, order } = course(track);
  const gate = gates[car.checkpoint];
  const along = (x, z) => -(x - gate.x) * gate.rightZ + (z - gate.z) * gate.rightX;
  const before = along(previousX, previousZ);
  const after = along(car.x, car.z);
  if (before < 0 && after >= 0) {
    const t = -before / (after - before);
    const x = previousX + (car.x - previousX) * t - gate.x;
    const z = previousZ + (car.z - previousZ) * t - gate.z;
    if (Math.abs(x * gate.rightX + z * gate.rightZ) <= wallOffset + 0.15) {
      if (track.oneWay) {
        car.started = true;
        car.checkpoint++;
        if (car.checkpoint === gates.length) car.finishedAt = elapsed - dt + t * dt;
      } else {
      if (car.checkpoint === 0) {
        if (car.started) car.lap++;
        car.started = true;
      }
      car.checkpoint = (car.checkpoint + 1) % gates.length;
      if (car.lap === track.laps) car.finishedAt = elapsed - dt + t * dt;
      }
    }
  }
  if (track.oneWay) {
    const road = track.nearestRoad(car.x, car.z);
    car.progress = Math.min(track.finish, road.index);
    return;
  }
  if (!car.started) {
    car.progress = -Math.hypot(car.x - gates[0].x, car.z - gates[0].z);
    return;
  }
  const from = gates[(car.checkpoint + gates.length - 1) % gates.length].offset;
  const to = car.checkpoint === 0 ? track.count : gates[car.checkpoint].offset;
  let nearest = Infinity;
  let offset = from;
  for (let i = from; i < to; i++) {
    const [x, , z] = order[i];
    const [nextX, , nextZ] = order[i + 1];
    const dx = nextX - x;
    const dz = nextZ - z;
    const t = Math.max(0, Math.min(1, ((car.x - x) * dx + (car.z - z) * dz) / (dx * dx + dz * dz)));
    const distance = (car.x - x - dx * t) ** 2 + (car.z - z - dz * t) ** 2;
    if (distance < nearest) {
      nearest = distance;
      offset = i + t;
    }
  }
  car.progress = car.lap * track.count + offset;
}

export function standings(cars) {
  return [...cars].sort((a, b) => {
    if (a.finishedAt !== null || b.finishedAt !== null) {
      return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) || a.number - b.number;
    }
    return b.progress - a.progress || a.number - b.number;
  });
}

export function catchUpFactor(track, car, leaderProgress, racerCount) {
  if (!car.started || car.finishedAt !== null || racerCount < 2) return 1;
  const metersBehind = Math.max(0, (leaderProgress - car.progress) * track.step);
  return 1 + 0.03 * Math.min(1, metersBehind / 160);
}

function confineToTrack(track, car) {
  const nearest = track.nearestRoad(car.x, car.z);
  if (nearest.distance <= wallClearance) return null;
  const x = (car.x - nearest.x) / nearest.distance;
  const z = (car.z - nearest.z) / nearest.distance;
  car.x = nearest.x + x * (wallClearance - 0.02);
  car.z = nearest.z + z * (wallClearance - 0.02);
  return { x, z };
}

function applyVelocity(car, x, z) {
  const magnitude = Math.hypot(x, z);
  if (magnitude < 0.001) {
    car.speed = 0;
    return;
  }
  const direction = car.speed < 0 ? -1 : 1;
  const turn = Math.atan2(x * direction, z * direction) - car.yaw;
  car.yaw += Math.atan2(Math.sin(turn), Math.cos(turn));
  car.speed = magnitude * direction;
}

function hoverBump(car, direction) {
  car.hoverSpin = hoverSpinSeconds;
  car.hoverSpinDirection = direction;
  car.driftDirection = 0;
  car.charge = 0;
  car.boostTime = Math.max(car.boostTime, 0.9);
  car.boostColor = hoverBoostColor;
  car.speed = Math.min(31, Math.max(0, car.speed) + 3.5);
}

export function resolveKartCollisions(track, cars) {
  const active = cars.filter(car => car.finishedAt === null);
  if (active.length < 2) return;
  const hovering = track.elevated ? new Set(active.filter(car => track.profile(car.z, car.x).hover >= 0.5)) : null;
  // Extra passes resolve contacts between several karts or alongside a wall.
  for (let pass = 0; pass < 3; pass++) {
    let contact = false;
    for (const [i, a] of active.entries()) {
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (a.powerTime > 0 || b.powerTime > 0) continue;
        if (Math.abs((a.flight?.y ?? 0) - (b.flight?.y ?? 0)) > 1.4) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const gap = Math.hypot(dx, dz);
        if (gap >= kartDiameter) continue;
        contact = true;
        const nx = gap ? dx / gap : 1;
        const nz = gap ? dz / gap : 0;
        const push = (kartDiameter - gap + 0.01) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        confineToTrack(track, a);
        confineToTrack(track, b);

        if (hovering?.has(a) && hovering.has(b)) {
          if (!(a.hoverSpin > 0 || b.hoverSpin > 0)) {
            const direction = nx * Math.cos(a.yaw) - nz * Math.sin(a.yaw) >= 0 ? 1 : -1;
            hoverBump(a, -direction);
            hoverBump(b, direction);
          }
          continue;
        }

        const ax = Math.sin(a.yaw) * a.speed;
        const az = Math.cos(a.yaw) * a.speed;
        const bx = Math.sin(b.yaw) * b.speed;
        const bz = Math.cos(b.yaw) * b.speed;
        const approach = (ax - bx) * nx + (az - bz) * nz;
        if (approach <= 0) continue;
        const impulse = approach * (1 + kartRestitution) / 2;
        applyVelocity(a, ax - nx * impulse, az - nz * impulse);
        applyVelocity(b, bx + nx * impulse, bz + nz * impulse);
      }
    }
    if (!contact) break;
  }
}

export function hitWall(track, car, previousX, previousZ) {
  const dx = car.x - previousX;
  const dz = car.z - previousZ;
  const normal = confineToTrack(track, car);
  if (!normal) return false;
  const { x: normalX, z: normalZ } = normal;
  const outward = dx * normalX + dz * normalZ;
  if (outward <= 0) return false;

  const impact = Math.min(1, outward / Math.hypot(dx, dz));
  const contactSpeed = 4 + 20 * (1 - impact ** 2);
  car.speed = Math.sign(car.speed) * Math.min(Math.abs(car.speed), contactSpeed);
  car.driftDirection = 0;
  car.charge = 0;
  car.boostTime = 0;
  return true;
}
