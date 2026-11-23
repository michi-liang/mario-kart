import { halfRoad, wallOffset } from './track.js';
import { mix } from './roster.js';

const tau = 2 * Math.PI;

export function box(mesh, place, x, y, z, w, h, d, colors) {
  const points = [[x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d],
    [x, y + h, z], [x + w, y + h, z], [x + w, y + h, z + d], [x, y + h, z + d]].map(place);
  const faces = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]];
  for (let i = 0; i < faces.length; i++) {
    mesh.push({ points: faces[i].map(index => points[index]), color: colors[i] ?? colors[0] });
  }
}

// Only the two faces a driver can see: the front riser and the top.
function slab(mesh, place, x, y, z, w, h, d, front, top) {
  mesh.push(
    { points: [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]].map(place), color: front },
    { points: [[x, y + h, z], [x + w, y + h, z], [x + w, y + h, z + d], [x, y + h, z + d]].map(place), color: top },
  );
}

const hash = n => {
  const value = Math.sin(n * 127.1) * 43758.5453;
  return value - Math.floor(value);
};

function roadStrip(road, track, a, b, left, right, color) {
  road.push({ color, points: [track.coursePoint(a, left), track.coursePoint(a, right),
    track.coursePoint(b, right), track.coursePoint(b, left)] });
}

function finishTiles(road, track, dark, light) {
  const { coursePoint, finish } = track;
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 16; column++) {
      const a = finish - row * 0.31;
      const tileWidth = (halfRoad * 2 - 1.3) / 16;
      const left = 0.65 - halfRoad + column * tileWidth;
      const right = left + tileWidth;
      const points = [left, right, right, left].map((offset, i) => {
        const from = coursePoint(finish - 1, offset);
        const to = coursePoint(finish, offset);
        const t = a - finish + 1 - (i >= 2 ? 0.31 : 0);
        return from.map((value, axis) => value + (to[axis] - value) * t);
      });
      road.push({ points, color: (row + column) % 2 ? light : dark });
    }
  }
}

// Large flat faces are culled by their center and radius before projection.
function measure(faces) {
  for (const face of faces) {
    const [a, , b] = face.points;
    face.center = a.map((value, index) => (value + b[index]) / 2);
    face.radius = Math.max(...face.points.map(([x, y, z]) =>
      Math.hypot(x - face.center[0], y - face.center[1], z - face.center[2])));
  }
}

function barriers(track, { base, top, height, rim, post }) {
  return track.wallSegments.map(([[ax, az], [bx, bz]], index) => {
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const mesh = [
      { points: [[ax, 0, az], [bx, 0, bz], [bx, height, bz], [ax, height, az]], color: base },
      { points: [[ax, height, az], [bx, height, bz], [bx, rim, bz], [ax, rim, az]], color: top },
    ];
    if (index % 5 === 0) {
      box(mesh, point => [point[0] + x, point[1], point[2] + z], -0.28, 0, -0.28,
        0.56, 2.21, 0.56, post(index));
    }
    return { x, z, mesh, range: 170, pad: 5 };
  });
}

function finishFrame(track) {
  const { coursePoint, finish } = track;
  const [x, , z] = coursePoint(finish);
  const [rightX, , rightZ] = coursePoint(finish, 1);
  const place = ([dx, y, dz]) => [
    x + (rightX - x) * dx - (rightZ - z) * dz, y,
    z + (rightZ - z) * dx + (rightX - x) * dz,
  ];
  return place;
}

export function buildScene(track) {
  const scene = track.id === 'neon' ? neonScene(track) : track.id === 'summit' ? summitScene(track) :
    track.id === 'stadium' ? stadiumScene(track) : coastScene(track);
  return { ...scene, terrain: chunks(scene.terrain, 8), road: chunks(scene.road, 20) };
}


function neonScene(track) {
  const road = [], terrain = [], props = [], gantry = [];
  const placeOn = (index, route, across = 0, lift = 0) => {
    const [x, , z] = track.coursePoint(index, across, 0, route);
    return track.surfacePoint(x, z, lift, route, index);
  };
  const padLocations = track.boostRows.map(row => Math.round(row * track.finish));
  const jumpLocations = track.jumpRows.map(row => Math.round(row * track.finish));
  for (const route of track.routes) {
    const width = route.width;
    for (let i = route.start; i < route.end; i++) {
      const jump = jumpLocations.find(index => i >= index - 4 && i < index + 6);
      if (jump !== undefined && i >= jump + 1 && i < jump + 5) continue;
      const ramp = jump === undefined ? () => 0 : index => index <= jump + 1
        ? Math.max(0, (index - jump + 4) * 0.19) : 0;
      const point = (index, across, h) => {
        const deck = route.deck?.[index - route.start];
        if (!deck) return placeOn(index, route, across, h + ramp(index));
        const { x, z, low, high } = deck;
        const edge = across < 0 ? high : low;
        const center = Math.max(low, Math.min(high, z));
        return track.surfacePoint(x, center + (edge - center) * Math.abs(across) / width, h + ramp(index), route, index);
      };
      const strip = (left, right, color, lift = 0) => {
        road.push({ color, points: [point(i, left, lift), point(i, right, lift),
          point(i + 1, right, lift), point(i + 1, left, lift)] });
      };
      const pad = padLocations.some(index => Math.abs(i - index) < 3);
      const rolling = route.roll && i >= route.roll[0] && i <= route.roll[1];
      const deckColor = ramp(i) > 0 ? '#512953' : i % 10 < 5 ? '#222849' : '#252c4d';
      if (rolling || route.section === 3) {
        // Split a twisting cross-section so its triangles follow the centerline
        // and each edge instead of cutting a single diagonal across the deck.
        for (let band = -2; band < 2; band++) strip(band * width / 2, (band + 1) * width / 2, deckColor);
      } else {
        strip(-width, width, deckColor);
      }
      if (pad || (jump !== undefined && i <= jump)) {
        for (const side of [-1, 1]) {
          const left = side === 1 ? 0.2 : -width * 0.80;
          const right = side === 1 ? width * 0.80 : -0.2;
          road.push({ color: pad ? '#8dffff' : '#ff95e8', points: [point(i, left, 0.065),
            point(i, right, 0.065), point(i + 1, right, 0.065), point(i + 2, left, 0.065)] });
        }
      } else if (i % 9 < 3) strip(-0.12, 0.12, '#626d9e', 0.035);
      for (const side of [-1, 1]) {
        const edge = side * width;
        const rail = side === -1 ? 'highRail' : 'lowRail';
        if (route.deck && !(route.deck[i - route.start][rail] && route.deck[i + 1 - route.start][rail])) continue;
        strip(Math.min(edge, edge - side * 0.55), Math.max(edge, edge - side * 0.55), route.color, 0.04);
        road.push({ color: i % 7 < 5 ? '#35456d' : route.color,
          points: [point(i, edge, 0), point(i + 1, edge, 0), point(i + 1, edge, 0.72), point(i, edge, 0.72)] });
      }
      const forkDistance = i - route.start;
      if (route.deck && forkDistance >= 13 && forkDistance <= 62 && forkDistance % 7 === 0 && !pad && jump === undefined) {
        const deck = route.deck[forkDistance];
        if (Math.min(deck.high - deck.z, deck.z - deck.low) > 0.65) {
          const arrow = [[-3, 0], [0, 2], [3, 0], [3, 1], [0, 3], [-3, 1]];
          road.push({ color: route.color, points: arrow.map(([x, advance]) => point(i + advance, x, 0.07)) });
        }
      }
      if (i % 32 === 0 && route.section !== 3 && !rolling && jump === undefined) {
        const [x, y, z] = point(i, 0, -0.4);
        const mesh = [];
        box(mesh, ([a, b, c]) => [x + a, b, z + c], -1.9, 0, -1.9, 3.8, y, 3.8,
          ['#18213c', '#263359', '#101932', '#1a2445', '#29355b']);
        props.push({ x, y: y * 0.65, z, mesh, range: 225, pad: 7 });
      }
    }
  }
  for (const pillar of track.spinPillars) {
    const surface = track.profile(pillar.z, pillar.x, pillar.route, pillar.index);
    const [x, y, z] = surface.point;
    const mesh = [];
    const rings = [[0.04, 1.23], [0.22, 1.08], [0.49, 0.88], [1.13, 0.88], [1.39, 1.02], [1.66, 0.71]];
    const colors = ['#344a52', '#a4f991', '#3c5f5d', '#bdff9d', '#60c978'];
    const vertex = (ring, side) => {
      const [lift, width] = rings[ring];
      const angle = side * tau / 10;
      return surface.point.map((value, i) => value + surface.up[i] * lift + pillar.radius * width *
        (Math.cos(angle) * surface.right[i] + Math.sin(angle) * surface.forward[i]));
    };
    for (let ring = 0; ring < rings.length - 1; ring++) {
      for (let side = 0; side < 10; side++) {
        mesh.push({ color: colors[ring], points: [vertex(ring, side), vertex(ring, side + 1),
          vertex(ring + 1, side + 1), vertex(ring + 1, side)] });
      }
    }
    mesh.push({ color: '#e0ffc7', points: Array.from({ length: 10 }, (_, side) => vertex(rings.length - 1, side)) });
    props.push({ x, y, z, mesh, range: 140, pad: 3 });
  }
  for (const [index, color] of [[track.startIndex + 7, '#50f0fb'], [track.finish, '#ffd279']]) {
    const point = (across, height, along = 0) => placeOn(index + along, undefined, across, height);
    for (let i = -10; i < 10; i++) {
      for (let row = 0; row < 2; row++) gantry.push({ color: (i + row) % 2 ? color : '#131833',
        points: [point(i, 0.09, row), point(i + 1, 0.09, row),
          point(i + 1, 0.09, row + 1), point(i, 0.09, row + 1)] });
    }
    for (const side of [-1, 1]) {
      const x = side * 9.6;
      gantry.push({ color, points: [point(x - 0.32, 0), point(x + 0.32, 0),
        point(x + 0.32, 7.6), point(x - 0.32, 7.6)] });
    }
    gantry.push({ color, points: [point(-10, 6.7), point(10, 6.7), point(10, 8.1), point(-10, 8.1)] });
  }

  for (let z = -610; z <= 825; z += 70) {
    for (let x = -870; x <= 890; x += 70) {
      const seed = x * 0.028 + z * 0.039;
      terrain.push({ color: hash(seed) > .5 ? '#081229' : '#0d1932',
        points: [[x, 0, z], [x + 68, 0, z], [x + 68, 0, z + 68], [x, 0, z + 68]] });
      for (const [dx, dz] of [[16, 17], [45, 43]]) {
        const gx = x + dx, gz = z + dz;
        const width = 19 + hash(seed + dx) * 15;
        const nearRoad = track.roadDistance(gx, gz) < width * 0.76 + 30;
        const tower = nearRoad ? 34 + hash(seed + dz) * 48 : 78 + hash(seed + dz) * 231;
        const mesh = [];
        const place = ([a, b, c]) => [gx + a, b, gz + c];
        const accent = ['#47cde6', '#b06aff', '#fa639f', '#e9ae78'][Math.floor(hash(seed + dx + dz) * 4)];
        box(mesh, place, -width / 2, 0, -width / 2, width, tower, width,
          ['#111b38', '#1c2347', '#202852', '#162043', '#35436a']);
        for (let level = 22; level < tower - 6; level += 23) {
          const a = width / 2 + 0.04, gap = width * 0.1;
          mesh.push({ color: accent, points: [[-a + gap, level, -a], [a - gap, level, -a],
            [a - gap, level + 1.2, -a], [-a + gap, level + 1.2, -a]].map(place) },
          { color: accent, points: [[a, level, -a + gap], [a, level, a - gap],
            [a, level + 1.2, a - gap], [a, level + 1.2, -a + gap]].map(place) },
          { color: accent, points: [[-a + gap, level, a], [a - gap, level, a],
            [a - gap, level + 1.2, a], [-a + gap, level + 1.2, a]].map(place) },
          { color: accent, points: [[-a, level, -a + gap], [-a, level, a - gap],
            [-a, level + 1.2, a - gap], [-a, level + 1.2, -a + gap]].map(place) });
        }
        if (tower >= 147) {
          box(mesh, place, -width * 0.31, tower, -width * 0.31, width * 0.62, 3, width * 0.62,
            [accent, '#4f3e78', '#654b95', '#36416a', '#795690']);
        }
        props.push({ x: gx, y: tower * 0.66, z: gz, mesh, range: 348, pad: width });
      }
    }
  }
  measure([...terrain, ...road]);
  return { sky: ['#04061c', '#271646'], ridge: ['#17183b', '#27204b'], ridgeScale: 0.10,
    ground: '#060d20', terrain, road, gantry, props, trees: [],
    filmShots: [{ progress: 0.11, side: 1, height: 29, sweep: 21 },
      { progress: 0.64, side: 1, height: 45, sweep: 26 },
      { progress: 0.9, side: -1, height: 32, sweep: 23 }] };
}

function chunks(faces, size) {
  const groups = [];
  for (let offset = 0; offset < faces.length; offset += size) {
    const batch = faces.slice(offset, offset + size);
    const first = batch[0].center;
    const last = batch.at(-1).center;
    const center = first.map((value, axis) => (value + last[axis]) / 2);
    let radius = 0;
    for (const face of batch) {
      const [x, y, z] = face.center;
      radius = Math.max(radius, face.radius + Math.hypot(x - center[0], y - center[1], z - center[2]));
    }
    groups.push({ center, radius, faces: batch });
  }
  return groups;
}

function summitLandscape(track, streams) {
  const terrain = [];
  const trees = [];
  const peaks = [
    [-180, -272, 64, 78], [-72, -110, 58, 76], [45, -283, 118, 100],
    [93, -242, 78, 79], [105, -146, 66, 66], [179, -271, 156, 108],
    [294, -216, 130, 104], [343, -21, 136, 94],
    [242, 108, 151, 105], [95, 153, 146, 112], [-76, 158, 128, 105],
    [-223, 113, 102, 104], [-354, -24, 117, 119], [-465, -148, 128, 122],
    [-405, -249, 96, 87], [-250, -288, 104, 79],
  ];
  const { launch, landing, centerZ, halfSpan } = track.jump;
  const route = new Map();
  for (let i = 0; i < track.count; i += 4) {
    const [x, , z] = track.centerline[i];
    if (x > launch && x < landing && Math.abs(z - centerZ) < halfSpan) continue;
    const position = track.surfacePoint(x, z);
    const key = Math.floor(position[2] / 32);
    if (!route.has(key)) route.set(key, []);
    route.get(key).push(position);
  }
  const streamX = (stream, z) => stream.x + 7 * Math.sin((z - stream.z) / 21);
  function heightAt(x, z) {
    let height = -7;
    for (const [cx, cz, peak, spread] of peaks) {
      const distance = Math.hypot(x - cx, (z - cz) * 1.18) / spread;
      height = Math.max(height, peak * Math.max(0, 1 - distance) ** 0.85 - 10);
    }
    height += 5 * Math.sin(x * 0.037 + z * 0.025) + 3 * Math.cos(z * 0.051 - x * 0.031);
    let ceiling = Infinity;
    let shelf = -Infinity;
    const row = Math.floor(z / 32);
    for (let key = row - 2; key <= row + 2; key++) {
      for (const [cx, y, cz] of route.get(key) ?? []) {
        const dx = x - cx;
        const dz = z - cz;
        if (Math.abs(dx) > 62 || Math.abs(dz) > 62) continue;
        const distance = Math.hypot(dx, dz);
        if (distance < 40) ceiling = Math.min(ceiling, y - 4 + Math.max(0, distance - 27) * 1.35);
        if (y > 5 && distance < 62) shelf = Math.max(shelf, y - 4 - distance * 0.66);
      }
    }
    height = Math.max(height, shelf);
    if (x > launch + 8 && x < landing + 18 && Math.abs(z - centerZ) < 42) {
      const cut = Math.min(1, (x - launch - 8) / 13, (landing + 18 - x) / 18, (42 - Math.abs(z - centerZ)) / 12);
      height += (Math.min(height, -13) - height) * cut;
    }
    for (const stream of streams) {
      const along = Math.abs(z - stream.z);
      const across = Math.abs(x - streamX(stream, z));
      if (along < 66 && across < 20) height = Math.min(height, -11 + across * 0.49 + Math.max(0, along - 54) * 0.6);
    }
    return Math.min(height, ceiling);
  }

  const step = 17;
  const rows = 37;
  const columns = 59;
  const vertices = Array.from({ length: rows + 1 }, (_, row) => Array.from({ length: columns + 1 }, (_, column) => {
    const x = -570 + column * step;
    const z = -345 + row * step;
    return [x, heightAt(x, z), z];
  }));
  function addFacet(a, b, c) {
    const height = (a[1] + b[1] + c[1]) / 3;
    const grade = Math.max(a[1], b[1], c[1]) - Math.min(a[1], b[1], c[1]);
    const colors = height > 101 ? ['#d8e4e6', '#b8ccd5', '#eff2ec'] : height > 55 || grade > 14 ?
      ['#687984', '#7b8a91', '#566a75'] : height > 30 || grade > 8 ?
        ['#6c956c', '#4e856b', '#85a46e'] : ['#70ac54', '#579650', '#8cb95d'];
    const shade = Math.floor(hash(a[0] * 4.7 + b[2] * 1.13 + c[1]) * colors.length);
    terrain.push({ color: colors[shade], points: [a, b, c] });
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = vertices[row][column], b = vertices[row][column + 1];
    const c = vertices[row + 1][column], d = vertices[row + 1][column + 1];
    addFacet(a, b, d);
    addFacet(a, d, c);
    if ((row * 2 + column) % 4 || a[1] < -6 || a[1] > 62 ||
        Math.max(Math.abs(a[1] - b[1]), Math.abs(a[1] - c[1])) > 10 ||
        track.roadDistance(a[0], a[2]) < 23) continue;
    const [x, y, z] = a;
    const tree = { x, y: y - 0.3, z, h: 5 + hash(x + z * 1.24) * 7 };
    tree.mesh = treeMesh(tree);
    trees.push(tree);
  }
  for (const stream of streams) {
    for (let z = stream.z - 54; z < stream.z + 54; z += 9) {
      const a = streamX(stream, z), b = streamX(stream, z + 9);
      terrain.push({ color: '#3db7cf', points: [[a - 7, -6, z], [a + 7, -6, z],
        [b + 7, -6, z + 9], [b - 7, -6, z + 9]] });
    }
  }
  return { terrain, trees };
}

function summitTunnel(point, start, end) {
  const props = [];
  const inner = [[-16, 0], [-16, 4], [-12, 7.6], [-6, 10], [0, 10.8],
    [6, 10], [12, 7.6], [16, 4], [16, 0]];
  const outer = [[-25, -3], [-25, 6], [-20, 14], [-11, 18], [0, 21],
    [10, 19], [19, 14], [24, 6], [25, -3]];
  for (let i = start; i < end; i += 3) {
    const next = Math.min(i + 3, end);
    const mesh = [];
    for (const [ring, colors] of [[inner, ['#515768', '#626a79']], [outer, ['#73817e', '#84908a', '#63748a']]]) {
      for (let j = 0; j + 1 < ring.length; j++) {
        mesh.push({ color: colors[(j + i) % colors.length], points: [point(i, ...ring[j]),
          point(i, ...ring[j + 1]), point(next, ...ring[j + 1]), point(next, ...ring[j])] });
      }
    }
    if (i === start || next === end) {
      const portal = i === start ? i : next;
      for (let j = 0; j + 1 < inner.length; j++) mesh.push({ color: '#98a09a',
        points: [point(portal, ...inner[j]), point(portal, ...inner[j + 1]),
          point(portal, ...outer[j + 1]), point(portal, ...outer[j])] });
    }
    for (const side of [-1, 1]) mesh.push({ color: '#ffe4a4', points: [point(i, side * 15.87, 2.6),
      point(i, side * 15.87, 3), point(i + 1, side * 15.87, 3), point(i + 1, side * 15.87, 2.6)] });
    const [x, y, z] = point(i, 0, 6);
    props.push({ x, y, z, mesh, range: 185, pad: 34 });
  }
  return props;
}

function summitScene(track) {
  const road = [];
  const props = [];
  const gantry = [];
  const crossings = [[27, -193], [218, -147]].map(([x, z]) =>
    ({ x, z, index: Math.round(track.nearestRoad(x, z).index) }));
  const { terrain, trees } = summitLandscape(track, crossings);
  const point = (index, offset, lift = 0) => {
    const [x, , z] = track.coursePoint(index, offset);
    return track.surfacePoint(x, z, lift);
  };
  const tunnel = Math.round(track.nearestRoad(96, -194).index);
  props.push(...summitTunnel(point, tunnel - 10, tunnel + 14));
  for (let i = 0; i < track.count; i++) {
    const left = track.widthAt(i);
    const nextWidth = track.widthAt(i + 1);
    const [logicalX, , logicalZ] = track.centerline[i];
    const [nextX, , nextZ] = track.centerline[(i + 1) % track.count];
    const { launch, landing, centerZ, halfSpan } = track.jump;
    if (Math.abs((logicalZ + nextZ) / 2 - centerZ) < halfSpan &&
        Math.max(logicalX, nextX) > launch && Math.min(logicalX, nextX) < landing) continue;
    const { hover, y } = track.profile(logicalZ, logicalX);
    const lit = hover > 0.35;
    const bridge = crossings.some(crossing => Math.abs(i - crossing.index) <= 8);
    const ramp = Math.abs(logicalZ - centerZ) < halfSpan && logicalX > launch - 14 && logicalX < launch;
    const add = (a, b, c, d, color, lift = 0) => {
      road.push({ color, points: [point(i, a, lift), point(i, b, lift),
        point(i + 1, c, lift), point(i + 1, d, lift)] });
    };
    if (!bridge) {
      for (const side of [-1, 1]) {
        road.push({ color: '#8ea958', points: [point(i, side * wallOffset, -0.20), point(i, side * left),
          point(i + 1, side * nextWidth), point(i + 1, side * wallOffset, -0.20)] });
      }
    }
    const color = bridge ? (i % 2 ? '#9a7553' : '#866647') : ramp ? (i % 4 ? '#2684a7' : '#afede7') :
      lit ? '#2e536c' : i % 4 < 2 ? '#46494a' : '#474b4b';
    add(-left, left, nextWidth, -nextWidth, color);
    const edge = bridge ? '#caad78' : lit ? (i % 3 ? '#73f2e8' : '#398aaf') :
      i % 4 < 2 ? '#ff6655' : '#fff1bf';
    add(-left, -left + 0.56, -nextWidth + 0.56, -nextWidth, edge, 0.012);
    add(left - 0.56, left, nextWidth, nextWidth - 0.56, edge, 0.012);
    if (lit && i % 5 === 0) add(-0.11, 0.11, 0.11, -0.11, '#81d8df', 0.014);
    if (bridge) {
      const [x, y, z] = point(i, 0);
      const mesh = [];
      for (const side of [-1, 1]) {
        const rail = side * wallOffset;
        mesh.push({ color: '#bc9c6b', points: [point(i, rail, 1.05), point(i + 1, rail, 1.05),
          point(i + 1, rail, 1.4), point(i, rail, 1.4)] });
        if (i % 2 === 0) mesh.push({ color: '#6c5741', points: [point(i, rail, 0), point(i + 1, rail, 0),
          point(i + 1, rail, 1.45), point(i, rail, 1.45)] });
      }
      add(-wallOffset, -left, -nextWidth, -wallOffset, '#7c694d', -0.025);
      add(left, wallOffset, wallOffset, nextWidth, '#7c694d', -0.025);
      props.push({ x, y, z, mesh, range: 138, pad: 17 });
    } else if (!lit && y > 4) {
      for (const side of [-1, 1]) {
        const a = point(i, wallOffset * side, -0.22);
        const b = point(i + 1, wallOffset * side, -0.22);
        const drop = Math.min(25, Math.max(9, y * 0.55));
        const c = point(i + 1, (wallOffset + 10) * side, -drop);
        const d = point(i, (wallOffset + 10) * side, -drop);
        road.push({ color: i % 4 < 2 ? '#68757b' : '#738078', points: [a, b, c, d] });
      }
      if (ramp && nextX >= launch - track.step) {
        const a = point(i + 1, -wallOffset, -0.22);
        const b = point(i + 1, wallOffset, -0.22);
        const c = [b[0], -10, b[2] + 7];
        const d = [a[0], -10, a[2] - 7];
        road.push({ color: '#5b6b76', points: [a, b, c, d] });
      }
    }
  }
  for (const [[ax, az], [bx, bz]] of track.wallSegments) {
    if (Math.abs((az + bz) / 2 - track.jump.centerZ) < track.jump.halfSpan + 2 &&
        Math.max(ax, bx) > track.jump.launch && Math.min(ax, bx) < track.jump.landing) continue;
    if (crossings.some(crossing => Math.hypot(crossing.x - (ax + bx) / 2, crossing.z - (az + bz) / 2) < 25)) continue;
    const a = track.surfacePoint(ax, az);
    const b = track.surfacePoint(bx, bz);
    const at = track.surfacePoint(ax, az, 1.35);
    const bt = track.surfacePoint(bx, bz, 1.35);
    props.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2,
      range: 190, pad: 5, mesh: [{ points: [a, b, bt, at], color: '#989a8b' }] });
  }
  const finishStart = road.length;
  finishTiles(road, track, '#242d42', '#f1fbf3');
  for (let i = finishStart; i < road.length; i++) {
    for (const point of road[i].points) point[1] += 0.035;
  }
  const place = finishFrame(track);
  for (const x of [-9, 8.2]) box(gantry, place, x, 0, -0.35, 0.8, 5, 0.7, ['#465a72']);
  box(gantry, place, -9, 4.8, -0.45, 18, 1.2, 0.9, ['#ffbe33', '#ffdb69']);
  measure(terrain);
  measure(road);
  return {
    sky: ['#47a9ff', '#def7ff'], ridge: ['#98c0d3', '#7296a1'], ridgeScale: 1.4, ground: '#58884f',
    terrain, road, trees, gantry, props,
    filmShots: [
      { progress: 0.055, side: -1, height: 16, sweep: 17 },
      { progress: 0.49, side: 1, height: 29, sweep: 16 },
      { progress: 0.29, side: -1, height: 21, sweep: 13 },
      { progress: 0.80, side: 1, height: 14, sweep: -11 },
    ],
  };
}

// ---------------------------------------------------------------- Sunbreak Coast

function coastScene(track) {
  const { centerline, coursePoint, finish, roadDistance } = track;
  const shoreX = z => 190 + 6 * Math.sin(z / 23) + 3 * Math.sin(z / 11);

  const terrain = [];
  for (let z = -216; z < 216; z += 12) {
    const next = z + 12;
    for (let x = -264; x < 168; x += 12) {
      const colorIndex = Math.abs(13 * ((x + 264) / 12) + 31 * ((z + 216) / 12)) % 3;
      const color = ['#77b654', '#7fbc58', '#82bf5a'][colorIndex];
      terrain.push({ color, points: [[x, 0, z], [x + 12, 0, z], [x + 12, 0, next], [x, 0, next]] });
    }
    const a = shoreX(z);
    const b = shoreX(next);
    terrain.push(
      { color: '#8fc565', points: [[168, 0, z], [a - 2, 0, z], [b - 2, 0, next], [168, 0, next]] },
      { color: '#f0d59d', points: [[a - 2, 0, z], [a + 7, 0, z], [b + 7, 0, next], [b - 2, 0, next]] },
      { color: '#89d8d3', points: [[a + 7, 0, z], [a + 14, 0, z], [b + 14, 0, next], [b + 7, 0, next]] },
    );
  }

  const road = [];
  for (let i = 0; i < centerline.length; i++) {
    roadStrip(road, track, i, i + 1, -halfRoad - 0.7, halfRoad + 0.7, '#b9cd81');
    roadStrip(road, track, i, i + 1, -halfRoad, halfRoad, '#556071');
    const edge = i % 2 ? '#fff0d5' : '#e06a56';
    roadStrip(road, track, i, i + 1, -halfRoad, -halfRoad + 0.57, edge);
    roadStrip(road, track, i, i + 1, halfRoad - 0.57, halfRoad, edge);
  }
  finishTiles(road, track, '#24354b', '#fff0d5');

  const trees = [];
  for (let i = 0; i < 200; i++) {
    const x = Math.sin(i * 41.81) * 153 - 21;
    const z = Math.sin(i * 17.77 + 0.3) * 131;
    if (roadDistance(x, z) > wallOffset + 1 && x < shoreX(z) - 9) {
      trees.push({ x, z, h: 3.2 + 3.5 * Math.abs(Math.sin(i * 5.7)) });
    }
  }
  for (const tree of trees) tree.mesh = treeMesh(tree);

  const gantry = [];
  {
    const place = finishFrame(track);
    const edge = halfRoad + 1.2;
    for (const x of [-edge, edge - 0.7]) {
      box(gantry, place, x, 0, -0.32, 0.7, 5.6, 0.64, ['#a94d44', '#c4614f', '#e67e62']);
      box(gantry, place, x - 0.22, 0, -0.50, 1.14, 0.51, 1.0, ['#4f7086', '#62889b']);
    }
    box(gantry, place, -edge, 4.65, -0.39, edge * 2, 1.7, 0.78, ['#265d76', '#35798d', '#42a6a7']);
    box(gantry, place, -edge, 6.30, -0.43, edge * 2, 0.18, 0.86, ['#f8b45b']);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        box(gantry, place, side * (1.55 + i * 0.61) - 0.23, 5.35, -0.44, 0.46, 0.22, 0.08, ['#a8e0d1']);
      }
    }
    const sun = Array.from({ length: 14 }, (_, i) => {
      const angle = i * tau / 14;
      return place([0.56 * Math.cos(angle), 5.55 + 0.56 * Math.sin(angle), -0.45]);
    });
    gantry.push({ points: sun, color: '#ffd075' });
  }

  measure([...terrain, ...road]);
  const props = barriers(track, {
    base: '#ead9b5', top: '#347a81', height: 1.6, rim: 2.05,
    post: () => ['#dca665', '#d6a36a', '#efbf80'],
  });
  return {
    sky: ['#69bde0', '#def3e8'], ridge: ['#a8cbd0', '#74aaa0'], ridgeScale: 1, ground: '#51aec7',
    terrain, road, trees, gantry, props,
    filmShots: [
      { progress: 0.09, side: -1, height: 7, sweep: 12 },
      { progress: 0.53, side: 1, height: 16, sweep: -11 },
      { progress: 0.33, side: -1, height: 11, sweep: 14 },
      { progress: 0.78, side: 1, height: 23, sweep: -15 },
    ],
  };
}

function treeMesh({ x, y: base = 0, z, h }) {
  const mesh = [];
  const place = ([dx, y, dz]) => [x + dx, base + y, z + dz];
  box(mesh, place, -0.12, 0, -0.12, 0.24, h * 0.55, 0.24, ['#5b5343']);
  for (let layer = 0; layer < 2; layer++) {
    const r = h * (0.28 - layer * 0.07);
    const y = base + h * (0.25 + layer * 0.27);
    const top = [x, base + h * (0.76 + layer * 0.24), z];
    const corners = [[x - r, y, z - r], [x + r, y, z - r], [x + r, y, z + r], [x - r, y, z + r]];
    for (let i = 0; i < 4; i++) {
      mesh.push({ points: [corners[i], corners[(i + 1) % 4], top],
        color: ['#41784b', '#4e8e50', '#69a655', '#51994e'][i] });
    }
  }
  return mesh;
}

// ---------------------------------------------------------------- Apex Stadium

// The grandstands follow a rounded rectangle around the whole circuit.
const bowl = { cx: 3, cz: -3, halfX: 215, halfZ: 125, radius: 62 };
const crowdColors = ['#c94f4f', '#e8b94a', '#4f8fd1', '#eeeeea', '#5aa86a', '#9b6bc9', '#e07a3f'];
const bannerColors = ['#2f6fed', '#f2a33a', '#2fb27d', '#e0527e', '#7d5be0', '#e8553f'];

function bowlDistance(x, z) {
  const qx = Math.abs(x - bowl.cx) - (bowl.halfX - bowl.radius);
  const qz = Math.abs(z - bowl.cz) - (bowl.halfZ - bowl.radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - bowl.radius;
}

// Walk the bowl counterclockwise and return a frame at each stand position.
function bowlFrames(spacing) {
  const { cx, cz, halfX, halfZ, radius: r } = bowl;
  const straightX = 2 * (halfX - r);
  const straightZ = 2 * (halfZ - r);
  const arc = Math.PI / 2 * r;
  const legs = [
    { length: straightX, at: u => [cx - (halfX - r) + u, cz - halfZ, 1, 0, 0, -1] },
    { length: arc, at: u => corner(cx + halfX - r, cz - halfZ + r, -Math.PI / 2 + u / r) },
    { length: straightZ, at: u => [cx + halfX, cz - (halfZ - r) + u, 0, 1, 1, 0] },
    { length: arc, at: u => corner(cx + halfX - r, cz + halfZ - r, u / r) },
    { length: straightX, at: u => [cx + (halfX - r) - u, cz + halfZ, -1, 0, 0, 1] },
    { length: arc, at: u => corner(cx - halfX + r, cz + halfZ - r, Math.PI / 2 + u / r) },
    { length: straightZ, at: u => [cx - halfX, cz + (halfZ - r) - u, 0, -1, -1, 0] },
    { length: arc, at: u => corner(cx - halfX + r, cz - halfZ + r, Math.PI + u / r) },
  ];
  function corner(centerX, centerZ, angle) {
    return [centerX + r * Math.cos(angle), centerZ + r * Math.sin(angle),
      -Math.sin(angle), Math.cos(angle), Math.cos(angle), Math.sin(angle)];
  }
  const perimeter = legs.reduce((sum, leg) => sum + leg.length, 0);
  const count = Math.round(perimeter / spacing);
  return Array.from({ length: count }, (_, i) => {
    let s = (i + 0.5) / count * perimeter;
    for (const leg of legs) {
      if (s < leg.length) {
        const [x, z, tx, tz, nx, nz] = leg.at(s);
        return { x, z, tx, tz, nx, nz };
      }
      s -= leg.length;
    }
  });
}

function framePlace({ x, z, tx, tz, nx, nz }) {
  return ([lx, ly, lz]) => [x + lx * tx + lz * nx, ly, z + lx * tz + lz * nz];
}

function standSection(frame, index) {
  const mesh = [];
  const place = framePlace(frame);
  const width = 13.6;
  for (let tier = 0; tier < 3; tier++) {
    const height = 2.3 * (tier + 1);
    const z = tier * 4.4;
    for (const [half, offset] of [[0, -width / 2], [1, 0]]) {
      const crowd = crowdColors[Math.floor(hash(index * 7 + tier * 3 + half) * crowdColors.length)];
      slab(mesh, place, offset, 0, z, width / 2, height, 4.4, crowd, mix(crowd, '#ffffff', 0.32));
    }
  }
  slab(mesh, place, -width / 2, 0, 13.2, width, 9.8, 0.8, '#59616b', '#7a838c');
  return { x: frame.x, z: frame.z, mesh, range: 330, pad: 9 };
}

function roofSection(frame) {
  const mesh = [];
  const place = framePlace(frame);
  box(mesh, place, -6.8, 11.4, -1.5, 13.6, 0.5, 16.2, ['#3a424b', '#3a424b', '#3a424b', '#3a424b', '#e4e7ea']);
  box(mesh, place, -6.5, 0, -1.2, 0.35, 11.4, 0.35, ['#4a535d']);
  box(mesh, place, 6.15, 0, -1.2, 0.35, 11.4, 0.35, ['#4a535d']);
  return { x: frame.x, z: frame.z, mesh, range: 330, pad: 9 };
}

function floodlight(frame) {
  const mesh = [];
  const place = framePlace(frame);
  box(mesh, place, -0.6, 0, 8, 1.2, 38, 1.2, ['#8a939c', '#737c85', '#8a939c', '#737c85', '#a4adb6']);
  box(mesh, place, -6, 33, 6.8, 12, 5.4, 1.1, ['#fff4c9', '#6b747d', '#59616a', '#6b747d', '#9aa3ac']);
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 4; column++) {
      box(mesh, place, -5.5 + column * 2.85, 33.4 + row * 2.5, 6.72, 2.4, 2.0, 0.1, ['#ffffff']);
    }
  }
  return { x: frame.x, z: frame.z, mesh, range: 420, pad: 14 };
}

function scoreboard() {
  const mesh = [];
  const place = ([x, y, z]) => [62 + x, y, -14 + z];
  for (const x of [-12, 11]) box(mesh, place, x, 0, -0.6, 1.4, 12, 1.2, ['#69727b', '#59626b', '#69727b', '#59626b', '#8d969f']);
  box(mesh, place, -16, 11, -1, 32, 11, 2, ['#12161c', '#1d232b', '#1d232b', '#1d232b', '#2a323b']);
  const palette = ['#ffd25a', '#4fd0ff', '#ff6b6b', '#8cf29a', '#ffffff'];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 8; column++) {
      const lit = hash(row * 9 + column) > 0.28;
      box(mesh, place, -14.4 + column * 3.6, 12.2 + row * 3.1, -1.08, 3.0, 2.4, 0.1,
        [lit ? palette[Math.floor(hash(row * 17 + column * 5) * palette.length)] : '#252d36']);
    }
  }
  return { x: 62, z: -14, mesh, range: 330, pad: 22 };
}

function pennant(x, z, index) {
  const mesh = [];
  const place = ([dx, y, dz]) => [x + dx, y, z + dz];
  box(mesh, place, -0.09, 0, -0.09, 0.18, 6.4, 0.18, ['#e9ecef']);
  const color = bannerColors[index % bannerColors.length];
  box(mesh, place, 0.09, 5.1, -0.03, 1.7, 1.1, 0.06, [color, color, mix(color, '#000000', 0.25)]);
  return { x, z, mesh, range: 150, pad: 4 };
}

function stadiumScene(track) {
  const { centerline } = track;
  const terrain = [];
  for (let z = -204; z < 204; z += 12) {
    for (let x = -300; x < 300; x += 12) {
      const distance = bowlDistance(x + 6, z + 6);
      const stripe = Math.floor((x + 300) / 12) % 2;
      const color = distance < -6 ? ['#6fb04f', '#78b856'][stripe]
        : distance < 0 ? '#a8aeb5'
        : distance < 15 ? '#6b727a'
        : ['#8d949b', '#858c93'][stripe];
      terrain.push({ color, points: [[x, 0, z], [x + 12, 0, z], [x + 12, 0, z + 12], [x, 0, z + 12]] });
    }
  }

  const road = [];
  for (let i = 0; i < centerline.length; i++) {
    roadStrip(road, track, i, i + 1, -halfRoad - 0.7, halfRoad + 0.7, '#9aa1a8');
    roadStrip(road, track, i, i + 1, -halfRoad, halfRoad, i % 6 < 3 ? '#3d4248' : '#41464c');
    const kerb = i % 2 ? '#f4efe6' : '#d8453d';
    roadStrip(road, track, i, i + 1, -halfRoad, -halfRoad + 0.57, kerb);
    roadStrip(road, track, i, i + 1, halfRoad - 0.57, halfRoad, kerb);
    if (i % 4 < 2) roadStrip(road, track, i, i + 1, -0.12, 0.12, '#e9e6dc');
  }
  finishTiles(road, track, '#15191e', '#f6f4ee');

  const gantry = [];
  {
    const place = finishFrame(track);
    const edge = halfRoad + 1.2;
    for (const x of [-edge, edge - 0.9]) {
      box(gantry, place, x, 0, -0.4, 0.9, 6.2, 0.8, ['#2b3138', '#3b434c', '#4a535d']);
    }
    box(gantry, place, -edge, 5.4, -0.55, edge * 2, 1.7, 1.1, ['#2b3138', '#2b3138', '#2b3138', '#2b3138', '#4a535d']);
    const cells = 18;
    const cell = edge * 2 / cells;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < cells; i++) {
        box(gantry, place, -edge + i * cell, 5.55 + row * 0.75, -0.6, cell, 0.75, 0.06,
          [(i + row) % 2 ? '#f6f4ee' : '#15191e']);
      }
    }
  }

  measure([...terrain, ...road]);

  const props = barriers(track, {
    base: '#f2f0ea', top: '#d8453d', height: 1.5, rim: 2.0,
    post: index => {
      const panel = bannerColors[Math.floor(index / 5) % bannerColors.length];
      return [panel, '#3a444f', panel, '#3a444f', '#4a545f'];
    },
  });

  const frames = bowlFrames(14);
  frames.forEach((frame, index) => {
    props.push(standSection(frame, index));
    // Roof the grandstand that faces the start straight.
    if (frame.nz < -0.9 && frame.x > -125 && frame.x < 105) props.push(roofSection(frame));
  });
  for (const frame of bowlFrames(150)) props.push(floodlight(frame));
  props.push(scoreboard());

  // Pennants on the grass beside the barriers, away from the racing line.
  for (const [index, [[ax, az], [bx, bz]]] of track.wallSegments.entries()) {
    if (index % 9 !== 0) continue;
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const near = track.nearestRoad(x, z);
    const away = Math.hypot(x - near.x, z - near.z) || 1;
    props.push(pennant(x + (x - near.x) / away * 2.4, z + (z - near.z) / away * 2.4, index));
  }

  return {
    sky: ['#4aa0e6', '#d4ebf6'], ridge: ['#b4c3d1', '#93a6b8'], ridgeScale: 0.35, ground: '#7d8a8f',
    terrain, road, trees: [], gantry, props,
    filmShots: [
      { progress: 0.06, side: -1, height: 9, sweep: 14 },
      { progress: 0.40, side: 1, height: 14, sweep: -13 },
      { progress: 0.62, side: -1, height: 12, sweep: 12 },
      { progress: 0.86, side: 1, height: 20, sweep: -14 },
    ],
  };
}
