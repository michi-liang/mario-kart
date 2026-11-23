import { wallOffset } from './track.js';

export const countdownSeconds = 3;
export const launchBoostColor = '#f8a14b';
export const kartScale = 0.56;
export const roadTopSpeed = 27;
export const grassSpeedFactor = 0.70;
export const hoverSpinSeconds = 0.64;
export const hoverBoostColor = '#6bf5e8';
export const pillarBoostColor = '#bfff85';
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
  Object.assign(car, { lap: 0, lineCrossings: 0, checkpoint: 0, started: false, progress: 0, finishedAt: null, wrongWayTime: 0 });
}

export function recoveryPose(track, car) {
  if (track.routes) {
    let index = Math.max(track.startIndex, Math.floor(car.progress) - 5);
    while (track.jumpGap(index)) index--;
    const [x, , z] = track.coursePoint(index, 0, 0, car.roadRoute);
    const [ax, , az] = track.coursePoint(index + 1, 0, 0, car.roadRoute);
    return { x, z, yaw: Math.atan2(ax - x, az - z) };
  }
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

export function offCourse(track, car, road, rail) {
  if (car.flight) return false;
  if (track.routes) {
    return (rail?.distance ?? road.distance - road.width) > 4 || (!car.jumpTime && track.jumpGap(road.index));
  }
  const gap = track.jump;
  return road.distance > wallClearance + 0.05 || Boolean(gap &&
    car.x > gap.launch + 1 && car.x < gap.landing && Math.abs(car.z - gap.centerZ) < gap.halfSpan);
}

export function advanceBullet(track, car, road, speed, dt) {
  if (car.bulletProgress === null) {
    car.bulletProgress = road.index;
    car.bulletLane = (car.x - road.x) * road.forwardZ - (car.z - road.z) * road.forwardX;
  }
  const progress = car.bulletProgress + speed * dt / track.step;
  car.bulletProgress = track.routes ? Math.min(progress, track.count - 2) : progress % track.count;
  car.bulletLane *= Math.exp(-4 * dt);
  const index = Math.floor(car.bulletProgress);
  const mix = car.bulletProgress - index;
  const [x, , z] = track.coursePoint(index, car.bulletLane, 0, road.route);
  const [nextX, , nextZ] = track.coursePoint(index + 1, car.bulletLane, 0, road.route);
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
  if (track.routes) {
    const road = track.nearestRoad(car.x, car.z, car.roadRoute);
    if (road.distance > road.width + 0.6 &&
        (track.forkRail(car.x, car.z, road.route)?.distance ?? Infinity) > 0.6) return;
    car.roadRoute = road.route;
    car.started = road.index >= track.startIndex + 5;
    const previous = car.progress;
    car.progress = Math.min(road.index, track.finish);
    if (previous < track.finish && road.index >= track.finish) {
      car.lineCrossings++;
      car.finishedAt = elapsed - dt + ((track.finish - previous) / (road.index - previous)) * dt;
    }
    return;
  }
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
      if (car.checkpoint === 0) {
        car.lineCrossings++;
        if (car.started) car.lap++;
        car.started = true;
      }
      car.checkpoint = (car.checkpoint + 1) % gates.length;
      if (car.lap === track.laps) car.finishedAt = elapsed - dt + t * dt;
    }
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
  if (car.flight || car.jumpTime > 0) return null;
  const nearest = track.nearestRoad(car.x, car.z, car.roadRoute);
  const fork = track.forkRail?.(car.x, car.z, nearest.route);
  if (fork) {
    if (fork.distance <= -0.42) return null;
    car.z = fork.insideZ;
    return fork;
  }
  const clearance = track.routes ? nearest.width - 0.42 : wallClearance;
  if (!Number.isFinite(nearest.distance) || nearest.distance <= clearance) return null;
  const x = (car.x - nearest.x) / nearest.distance;
  const z = (car.z - nearest.z) / nearest.distance;
  car.x = nearest.x + x * (clearance - 0.02);
  car.z = nearest.z + z * (clearance - 0.02);
  return { x, z };
}

function pushKart(car, x, z) {
  const forwardX = Math.sin(car.yaw), forwardZ = Math.cos(car.yaw);
  const along = x * forwardX + z * forwardZ;
  car.speed += along;
  car.bumpX = (car.bumpX ?? 0) + x - along * forwardX;
  car.bumpZ = (car.bumpZ ?? 0) + z - along * forwardZ;
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

export function hitSpinPillar(track, car, previousX, previousZ, road) {
  if (!track.spinPillars || car.flight || car.jumpTime > 0 || car.pillarCooldown > 0) return false;
  const dx = car.x - previousX, dz = car.z - previousZ;
  const traveled = dx * dx + dz * dz;
  if (traveled < 0.00001) return false;
  for (const pillar of track.spinPillars) {
    if (pillar.route !== road.route || Math.abs(pillar.index - road.index) > 5) continue;
    const x = previousX - pillar.x, z = previousZ - pillar.z;
    const reach = pillar.radius + kartDiameter * 0.45;
    if (x * dx + z * dz >= 0) continue;
    const contact = Math.max(0, Math.min(1, -(x * dx + z * dz) / traveled));
    if ((x + dx * contact) ** 2 + (z + dz * contact) ** 2 > reach ** 2) continue;
    const rightX = pillar.forwardZ, rightZ = -pillar.forwardX;
    const lateral = x * rightX + z * rightZ;
    const lane = (pillar.x - road.x) * rightX + (pillar.z - road.z) * rightZ;
    const preferred = Math.abs(lateral) > 0.14 ? Math.sign(lateral) : Math.sign(car.steering) || (car.number % 2 ? 1 : -1);
    const side = Math.abs(lane + preferred * (reach + 1.1)) < road.width - 0.65 ? preferred : -preferred;
    const travelDirection = dx * pillar.forwardX + dz * pillar.forwardZ < 0 ? -1 : 1;
    const separation = (reach + 0.24) * side;
    const along = (x + dx) * pillar.forwardX + (z + dz) * pillar.forwardZ;
    car.x = pillar.x + along * pillar.forwardX + separation * rightX;
    car.z = pillar.z + along * pillar.forwardZ + separation * rightZ;
    const heading = Math.atan2(pillar.forwardX * travelDirection, pillar.forwardZ * travelDirection);
    const turn = heading - car.yaw;
    car.yaw += Math.atan2(Math.sin(turn), Math.cos(turn));
    car.bumpX = rightX * side * 2.4;
    car.bumpZ = rightZ * side * 2.4;
    confineToTrack(track, car);
    hoverBump(car, side);
    car.spinTime = 0;
    car.boostColor = pillarBoostColor;
    car.boostCount++;
    car.speed = Math.max(21, car.speed);
    car.pillarCooldown = 0.9;
    return true;
  }
  return false;
}

export function resolveKartCollisions(track, cars) {
  const active = cars.filter(car => car.finishedAt === null);
  if (active.length < 2) return;
  const surfaces = new Map();
  const surfaceOf = car => {
    if (!surfaces.has(car)) {
      const road = track.elevated ? track.profile(car.z, car.x, car.roadRoute) : null;
      surfaces.set(car, { height: car.flight?.y ?? (road?.y ?? 0) + (car.jumpHeight ?? 0),
        hovering: road?.hover >= 0.5 && !car.flight && !car.jumpTime });
    }
    return surfaces.get(car);
  };
  // Extra passes resolve contacts between several karts or alongside a wall.
  for (let pass = 0; pass < 3; pass++) {
    let contact = false;
    for (const [i, a] of active.entries()) {
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (a.powerTime > 0 || b.powerTime > 0) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const gap = Math.hypot(dx, dz);
        if (gap >= kartDiameter - 0.015) continue;
        const surfaceA = surfaceOf(a), surfaceB = surfaceOf(b);
        if (Math.abs(surfaceA.height - surfaceB.height) > 1.25) continue;
        contact = true;
        const nx = gap ? dx / gap : 1;
        const nz = gap ? dz / gap : 0;
        const push = (kartDiameter - gap) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        // A pinned kart can't take its share of the separation. Move the
        // other kart by that amount instead of repeatedly pressing both into the rail.
        const axBeforeWall = a.x, azBeforeWall = a.z, bxBeforeWall = b.x, bzBeforeWall = b.z;
        const wallA = confineToTrack(track, a), wallB = confineToTrack(track, b);
        if (wallA && !wallB) {
          const lost = Math.max(0, (a.x - axBeforeWall) * nx + (a.z - azBeforeWall) * nz);
          b.x += lost * nx;
          b.z += lost * nz;
          confineToTrack(track, b);
        } else if (wallB && !wallA) {
          const lost = Math.max(0, (bxBeforeWall - b.x) * nx + (bzBeforeWall - b.z) * nz);
          a.x -= lost * nx;
          a.z -= lost * nz;
          confineToTrack(track, a);
        }
        if (pass > 0) continue;

        if (surfaceA.hovering && surfaceB.hovering) {
          if (!(a.hoverSpin > 0 || b.hoverSpin > 0)) {
            const direction = nx * Math.cos(a.yaw) - nz * Math.sin(a.yaw) >= 0 ? 1 : -1;
            hoverBump(a, -direction);
            hoverBump(b, direction);
          }
          continue;
        }

        const ax = Math.sin(a.yaw) * a.speed + (a.bumpX ?? 0);
        const az = Math.cos(a.yaw) * a.speed + (a.bumpZ ?? 0);
        const bx = Math.sin(b.yaw) * b.speed + (b.bumpX ?? 0);
        const bz = Math.cos(b.yaw) * b.speed + (b.bumpZ ?? 0);
        const approach = (ax - bx) * nx + (az - bz) * nz;
        if (approach <= 0) continue;
        if (!a.flight && !b.flight && a.passCooldown <= 0 && b.passCooldown <= 0 && approach > 2) {
          const passer = Math.abs(a.speed) > Math.abs(b.speed) ? a : b;
          const other = passer === a ? b : a;
          const rightX = Math.cos(passer.yaw), rightZ = -Math.sin(passer.yaw);
          const gapSide = (passer.x - other.x) * rightX + (passer.z - other.z) * rightZ;
          const road = track.nearestRoad(passer.x, passer.z, passer.roadRoute);
          const roadSide = (passer.x - road.x) * rightX + (passer.z - road.z) * rightZ;
          const side = Math.abs(roadSide) > 4 ? -Math.sign(roadSide) : Math.abs(gapSide) > 0.14 ?
            Math.sign(gapSide) : passer.number % 2 ? 1 : -1;
          passer.bumpX += rightX * side * 8;
          passer.bumpZ += rightZ * side * 8;
          passer.speed *= 0.92;
          passer.passCooldown = other.passCooldown = 0.32;
        }
        const impulse = Math.min(1.15, approach * (1 + kartRestitution) / 2);
        pushKart(a, -nx * impulse, -nz * impulse);
        pushKart(b, nx * impulse, nz * impulse);
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
  const bumpOutward = car.bumpX * normalX + car.bumpZ * normalZ;
  if (bumpOutward > 0) {
    car.bumpX -= bumpOutward * normalX;
    car.bumpZ -= bumpOutward * normalZ;
  }

  const impact = Math.min(1, outward / Math.hypot(dx, dz));
  const contactSpeed = 4 + 20 * (1 - impact ** 2);
  car.speed = Math.sign(car.speed) * Math.min(Math.abs(car.speed), contactSpeed);
  car.driftDirection = 0;
  car.charge = 0;
  car.boostTime = 0;
  return true;
}
