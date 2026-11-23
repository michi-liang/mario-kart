const cellSize = 24;
const layoutScale = 0.90;
const axisZ = 320 * layoutScale;
const twistStart = -8 * layoutScale;
const twistEnd = 414 * layoutScale;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const ease = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
// Match the level deck at each end, with nearly constant roll speed through the middle.
const rollEase = t => {
  const transition = 0.20;
  if (t > 1 - transition) return 1 - rollEase(1 - t);
  return (t < transition ? t * t / (2 * transition) : t - transition / 2) / (1 - transition);
};

const sections = [
  [[[-740, -490], [-626, -489], [-540, -438], [-453, -473], [-369, -458], [-296, -388],
    [-224, -345], [-147, -350], [-70, -350]]],
  [
    [[-70, -350], [1, -350], [105, -325], [187, -368], [283, -337], [397, -364], [463, -352], [500, -350]],
    [[-70, -350], [-28, -326], [72, -251], [166, -277], [244, -229], [348, -262], [450, -326], [500, -350]],
    [[-70, -350], [-28, -374], [88, -451], [166, -421], [255, -471], [351, -443], [450, -374], [500, -350]],
  ],
  [[[500, -350], [630, -350], [716, -296], [753, -220], [718, -157], [640, -130],
    [554, -179], [477, -165], [417, -100], [331, -78], [250, -118], [157, -88],
    [62, -120], [-42, -58], [-134, -93], [-231, -53], [-323, -90], [-430, -77],
    [-555, -26], [-634, 55], [-608, 134], [-647, 218], [-569, 273], [-470, 288],
    [-377, 351], [-289, 302], [-199, 320], [-100, 320]]],
  [
    [[-100, 320], [-52, 325], [-2, 342], [120, 342], [272, 342], [411, 342], [444, 327], [480, 320]],
    [[-100, 320], [-52, 315], [-2, 298], [120, 298], [272, 298], [411, 298], [444, 313], [480, 320]],
  ],
  [[[480, 320], [570, 320], [664, 291], [749, 370], [714, 456], [756, 522],
    [665, 613], [570, 566], [468, 636], [383, 575], [292, 632], [202, 582], [110, 624],
    [22, 677], [-76, 628], [-158, 672], [-253, 632], [-354, 663], [-448, 646], [-560, 646]]],
];
const palette = ['#49edff', '#fd72db', '#ffbf65'];

function sample(anchors) {
  const points = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [a, b, c, d] = [-1, 0, 1, 2].map(offset => anchors[clamp(i + offset, 0, anchors.length - 1)]);
    for (let j = 0; j < 24; j++) {
      const t = j / 24;
      points.push(b.map((value, axis) => value + 0.5 * t *
        (c[axis] - a[axis] + t * (2 * a[axis] - 5 * value + 4 * c[axis] - d[axis] +
          t * (3 * value - a[axis] - 3 * c[axis] + d[axis])))));
    }
  }
  points.push(anchors.at(-1));
  let length = 0;
  const lengths = points.map(([x, z], i) => {
    if (i) length += Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
    return length;
  });
  return { points, lengths, length };
}

const baseHeight = (x, z) =>
  218 + 25 * Math.sin(x / 230) + 16 * Math.cos(z / 195) + 7 * Math.sin((x + z) / 176);
const rollsBySection = { 0: [0.23, 0.72], 2: [0.32, 0.65], 4: [0.31, 0.70] };
const unit = vector => {
  const length = Math.hypot(...vector);
  return vector.map(value => value / length);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function buildNeonTrack() {
  const step = 2;
  const routes = [];
  const primary = [];
  const cells = new Map();
  let start = 0;
  for (const [section, choices] of sections.entries()) {
    const fork = choices.length > 1;
    const sampled = choices.map(anchors => sample(anchors.map(point => point.map(value => value * layoutScale))));
    const span = Math.ceil(sampled[0].length / step);
    const lanes = [];
    for (const [lane, { points, lengths, length }] of sampled.entries()) {
      let segment = 1;
      const firstX = points[0][0], lastX = points.at(-1)[0];
      const line = Array.from({ length: span + 1 }, (_, i) => {
        if (i === span) return points.at(-1);
        if (fork) {
          const x = firstX + (lastX - firstX) * i / span;
          while (points[segment][0] < x) segment++;
          const [ax, az] = points[segment - 1], [bx, bz] = points[segment];
          const mix = (x - ax) / (bx - ax);
          // Give each fork the same tangent as the shared road at both seams.
          const gate = ease((x - firstX) / 20) * ease((lastX - x) / 20);
          const endZ = x - firstX < lastX - x ? points[0][1] : points.at(-1)[1];
          return [x, endZ + (az + (bz - az) * mix - endZ) * gate];
        }
        const distance = i / span * length;
        while (lengths[segment] < distance) segment++;
        const mix = (distance - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1]);
        return points[segment - 1].map((value, axis) => value + (points[segment][axis] - value) * mix);
      });
      const route = { id: routes.length, section, lane, width: fork ? 8.3 : 10,
        start, end: start + span, samples: line, color: palette[lane] };
      const roll = rollsBySection[section];
      if (roll) route.roll = roll.map(fraction => start + fraction * span);
      routes.push(route);
      lanes.push(route);
      if (!lane) primary.push(...line.slice(start === 0 ? 0 : 1));
      for (let i = 0; i < span; i++) {
        const [x, z] = line[i], [bx, bz] = line[i + 1];
        const dx = bx - x, dz = bz - z;
        const length = Math.hypot(dx, dz);
        const road = { x, z, dx, dz, length, route, index: start + i };
        for (let row = Math.floor((Math.min(z, bz) - 26) / cellSize); row <= Math.floor((Math.max(z, bz) + 26) / cellSize); row++) {
          for (let column = Math.floor((Math.min(x, bx) - 26) / cellSize); column <= Math.floor((Math.max(x, bx) + 26) / cellSize); column++) {
            const key = column + ',' + row;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(road);
          }
        }
      }
    }
    if (fork) {
      // Partition each shared cross-section at the lane midpoints. This gives
      // overlapping lanes one opaque deck and one exterior rail at each edge.
      const middle = Math.floor(span / 2);
      const order = [...lanes].sort((a, b) => a.samples[middle][1] - b.samples[middle][1]);
      for (const route of lanes) {
        route.deck = [];
        route.forkLanes = order;
      }
      for (let i = 0; i <= span; i++) {
        const edges = order.map(route => {
          const [x, z] = route.samples[i];
          const [ax, az] = route.samples[Math.max(0, i - 1)];
          const [bx, bz] = route.samples[Math.min(span, i + 1)];
          const half = widthAt(start + i, route) * Math.hypot(bx - ax, bz - az) / (bx - ax);
          return { x, z, low: z - half, high: z + half, lowRail: true, highRail: true };
        });
        for (let lane = 1; lane < edges.length; lane++) {
          const left = edges[lane - 1], right = edges[lane];
          if (left.high < right.low) continue;
          const split = clamp((left.z + right.z) / 2, right.low, left.high);
          left.high = right.low = split;
          left.highRail = right.lowRail = false;
        }
        edges.forEach((edge, lane) => order[lane].deck.push(edge));
      }
    }
    start += span;
  }
  const startIndex = 12;
  const finish = start - 27;
  function widthAt(index, route) {
    if (!route) return 10;
    const edge = Math.min(index - route.start, route.end - index);
    return 10 + (route.width - 10) * ease(edge / 15);
  }
  function nearestRoad(x, z, preferred) {
    const nearby = cells.get(Math.floor(x / cellSize) + ',' + Math.floor(z / cellSize)) ?? [];
    let score = Infinity;
    let nearest = { x, z, index: 0, distance: Infinity, forwardX: 1, forwardZ: 0, width: 10 };
    for (const road of nearby) {
      const t = clamp(((x - road.x) * road.dx + (z - road.z) * road.dz) / road.length ** 2, 0, 1);
      const px = road.x + road.dx * t, pz = road.z + road.dz * t;
      const distance = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
      const index = road.index + t, width = widthAt(index, road.route);
      const stick = road.route === preferred ? Math.min(0.65, Math.max(0, width - 0.42 - distance)) : 0;
      const margin = distance - width - stick;
      if (margin >= score) continue;
      score = margin;
      nearest = { x: px, z: pz, index, distance,
        forwardX: road.dx / road.length, forwardZ: road.dz / road.length,
        route: road.route, width };
    }
    return nearest;
  }
  function forkRail(x, z, route) {
    if (!route?.deck) return null;
    const firstX = route.deck[0].x, lastX = route.deck.at(-1).x;
    if (x < firstX || x > lastX) return null;
    const station = (x - firstX) / (lastX - firstX) * (route.deck.length - 1);
    const i = Math.min(Math.floor(station), route.deck.length - 2);
    const blend = station - i;
    const intervals = [];
    for (const lane of route.forkLanes) {
      const [a, b] = [lane.deck[i], lane.deck[i + 1]];
      const low = a.low + (b.low - a.low) * blend;
      const high = a.high + (b.high - a.high) * blend;
      const highSlope = (b.high - a.high) / (b.x - a.x);
      const last = intervals.at(-1);
      if (last && low <= last.high + 0.00001) {
        last.high = high;
        last.highSlope = highSlope;
      } else {
        intervals.push({ low, high, lowSlope: (b.low - a.low) / (b.x - a.x), highSlope });
      }
    }
    let nearest = null;
    for (const { low, high, lowSlope, highSlope } of intervals) {
      const below = z - low < high - z;
      const sign = below ? -1 : 1;
      const slope = below ? lowSlope : highSlope;
      const edge = below ? low : high;
      const length = Math.hypot(1, slope);
      const distance = sign * (z - edge) / length;
      if (!nearest || distance < nearest.distance) {
        nearest = { distance, x: -sign * slope / length, z: sign / length,
          insideZ: edge - sign * 0.44 * length };
      }
    }
    return nearest;
  }
  const routesAt = index => routes.filter(route => index >= route.start && index < route.end);
  function coursePoint(index, offset = 0, height = 0, preferred) {
    const route = preferred && index >= preferred.start && index <= preferred.end ? preferred : null;
    const samples = route?.samples ?? primary;
    const i = clamp(Math.floor(index - (route?.start ?? 0)), 0, samples.length - 1);
    const [x, z] = samples[i];
    const [ax, az] = samples[Math.max(0, i - 1)], [bx, bz] = samples[Math.min(samples.length - 1, i + 1)];
    const length = Math.hypot(bx - ax, bz - az);
    return [x + (bz - az) * offset / length, height, z - (bx - ax) * offset / length];
  }
  function rollPhase(route, index) {
    if (!route?.roll) return 0;
    const [start, end] = route.roll;
    return clamp((index - start) / (end - start), 0, 1);
  }
  function roadTangent(route, index) {
    const local = clamp(index - route.start, 0, route.samples.length - 1);
    const i = Math.min(Math.floor(local), route.samples.length - 2);
    const join = local - i;
    const [ax, az] = route.samples[Math.max(0, i - 1)], [bx, bz] = route.samples[i];
    const [cx, cz] = route.samples[i + 1], [dx, dz] = route.samples[Math.min(i + 2, route.samples.length - 1)];
    const before = i > 0 ? 0.5 : 1;
    const after = i < route.samples.length - 2 ? 0.5 : 1;
    return [(cx - ax) * before * (1 - join) + (dx - bx) * after * join,
      (cz - az) * before * (1 - join) + (dz - bz) * after * join];
  }
  function headingAt(road) {
    const [dx, dz] = roadTangent(road.route, road.index);
    return Math.atan2(dx, dz);
  }
  function world(x, z, route, index) {
    const phase = rollPhase(route, index);
    if (phase > 0 && phase < 1) {
      const local = index - route.start;
      const i = Math.floor(local), blend = local - i;
      const [ax, az] = route.samples[i], [bx, bz] = route.samples[i + 1];
      const cx = ax + (bx - ax) * blend, cz = az + (bz - az) * blend;
      const [tx, tz] = roadTangent(route, index);
      const length = Math.hypot(tx, tz);
      const nx = -tz / length, nz = tx / length;
      const lateral = (x - cx) * nx + (z - cz) * nz;
      const angle = 2 * Math.PI * rollEase(phase) * (route.section === 2 ? -1 : 1);
      const shift = lateral * (Math.cos(angle) - 1);
      const centerHeight = baseHeight(cx, cz);
      return [x + nx * shift,
        centerHeight + (baseHeight(x, z) - centerHeight) * Math.cos(angle) + lateral * Math.sin(angle),
        z + nz * shift];
    }
    if (route?.section !== 3 || x <= twistStart || x >= twistEnd) return [x, baseHeight(x, z), z];
    const t = (x - twistStart) / (twistEnd - twistStart);
    const angle = 2 * Math.PI * rollEase(t);
    const invert = route.lane ? Math.PI * ease(t / 0.42) * ease((1 - t) / 0.42) : 0;
    const center = (route.lane ? -22 : 22) * layoutScale;
    const across = z - axisZ - center;
    const centerHeight = baseHeight(x, axisZ + center);
    return [x, centerHeight + (baseHeight(x, z) - centerHeight) * Math.cos(angle + invert) +
      0.62 * center * Math.sin(angle) + across * Math.sin(angle + invert),
      axisZ + center * Math.cos(angle) + across * Math.cos(angle + invert)];
  }
  function profile(z, x, route, station) {
    const road = station === undefined ? nearestRoad(x, z, route) : null;
    route = road?.route ?? route;
    const index = station ?? road?.index;
    const phase = rollPhase(route, index);
    const [tx, tz] = route ? roadTangent(route, index) : [0, 1];
    const length = Math.hypot(tx, tz);
    let dx = 0, dz = 0;
    if (phase > 0 && phase < 1) {
      const scale = 0.15 / (length * length);
      dx = tx * scale;
      dz = tz * scale;
    }
    const point = world(x, z, route, index);
    const left = world(x - 0.15, z, route, index - dx), right = world(x + 0.15, z, route, index + dx);
    const back = world(x, z - 0.15, route, index - dz), ahead = world(x, z + 0.15, route, index + dz);
    const worldX = right.map((value, i) => value - left[i]);
    const worldZ = ahead.map((value, i) => value - back[i]);
    const up = unit(cross(worldZ, worldX));
    // Preserve the road's true forward direction, even when the ribbon is
    // vertical or upside down and the world X/Z derivatives have some shear.
    const along = unit(worldX.map((value, i) => value * tx + worldZ[i] * tz));
    const across = cross(up, along);
    const rightAxis = along.map((value, i) => (value * tx + across[i] * tz) / length);
    const forward = along.map((value, i) => (value * tz - across[i] * tx) / length);
    const hover = route?.section === 3 ? ease((x - twistStart) / 22) * ease((twistEnd - x) / 22) :
      ease(phase / 0.075) * ease((1 - phase) / 0.075);
    return { point, right: rightAxis, up, forward, y: point[1], z: point[2], sin: forward[1], cos: forward[2], hover };
  }
  const surfacePoint = (x, z, height = 0, route, index) => {
    if (!height) {
      const road = index === undefined ? nearestRoad(x, z, route) : null;
      return world(x, z, road?.route ?? route, index ?? road?.index);
    }
    const { point, up } = profile(z, x, route, index);
    return point.map((value, i) => value + up[i] * height);
  };
  const bounds = { minX: -780, maxX: 815, minZ: -530, maxZ: 715 };
  const mapPoint = (x, z) => [60 + (x / layoutScale - 17.5) * 0.066, 50 - (z / layoutScale - 92.5) * 0.066];
  const jumpRows = [0.19, 0.45, 0.86];
  const jumpGap = index => jumpRows.some(row => {
    const start = Math.round(row * finish);
    return index >= start + 1 && index < start + 5;
  });
  const spinPillars = routes.flatMap(route => {
    const stations = route.section === 3 ? [0.27, 0.58, 0.78] : route.roll ? [0.29, 0.46, 0.62] : [0.44, 0.69];
    return stations.flatMap((fraction, n) => {
      const index = Math.round(route.start + (route.end - route.start) * fraction);
      if (jumpRows.some(row => Math.abs(index - Math.round(row * finish)) < 18)) return [];
      const offset = n === 1 ? 0 : (n % 2 ? -1 : 1) * 3.1 * (route.lane % 2 ? -1 : 1);
      const [x, , z] = coursePoint(index, offset, 0, route);
      const [ax, , az] = coursePoint(index - 1, 0, 0, route);
      const [bx, , bz] = coursePoint(index + 1, 0, 0, route);
      const length = Math.hypot(bx - ax, bz - az);
      return [{ x, z, index, route, offset, radius: 1.06, forwardX: (bx - ax) / length, forwardZ: (bz - az) / length }];
    });
  });
  return { id: 'neon', name: 'Neon Divide', tagline: 'Skyline forks, rooftop jumps and the Helix',
    oneWay: true, elevated: true, routes, routesAt, centerline: primary.map(([x, z]) => [x, 0, z]),
    count: primary.length, step, courseLength: (finish - startIndex) * step, startIndex, finish, bounds,
    itemRows: [0.1, 0.22, 0.38, 0.52, 0.68, 0.81, 0.92],
    boostRows: [0.065, 0.16, 0.24, 0.42, 0.57, 0.685, 0.73, 0.84, 0.95],
    jumpRows, jumpGap, spinPillars, wallSegments: [], mapPoint, profile, surfacePoint, coursePoint, forkRail, headingAt,
    nearestRoad, roadDistance: (x, z) => nearestRoad(x, z).distance,
    widthAt,
  };
}
