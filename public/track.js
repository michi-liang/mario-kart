export const halfRoad = 8.28;
export const wallOffset = halfRoad + 7.5;

// Closed splines through each course. Sunbreak Coast has a long launch
// straight, an inland S-bend, and a hairpin above the beach. Apex Stadium is a
// flat-out circuit built around a grandstand straight, a wide sweeper, a
// chicane, and an infield hairpin.
const coastAnchors = [
  [-53, -40], [-53, -9], [-45, 11], [-57, 29], [-49, 44], [-34, 54], [-3, 46],
  [17, 23], [43, 24], [63, 49], [83, 32], [81, 3],
  [64, -17], [41, -19], [24, -40], [2, -52], [-27, -52],
].map(point => point.map(value => value * 1.72));

const stadiumAnchors = [
  [-100, -72], [-45, -74], [15, -74], [82, -74],
  [134, -68], [154, -46], [156, 15], [143, 49],
  [108, 66], [76, 48], [52, 49], [34, 69], [9, 66],
  [-12, 47], [-15, 5], [-27, -15], [-54, -21], [-73, -6], [-75, 13], [-70, 36],
  [-84, 58], [-114, 62], [-142, 42], [-150, 6], [-144, -34], [-126, -60],
];

const summitAnchors = [
  [-240, -190], [-175, -192], [-90, -191], [-5, -190], [80, -195], [150, -178],
  [185, -146], [234, -145], [260, -115], [242, -67], [190, -48], [181, -16],
  [204, 16], [184, 50], [150, 64], [150, 90], [150, 129], [150, 168],
  [131, 199], [91, 214], [51, 200], [27, 169], [27, 128], [27, 101],
  [26, 61], [4, 26], [-40, 44], [-84, 51], [-107, 27], [-98, -10], [-123, -47],
  [-167, -37], [-194, 4], [-232, 28], [-273, 5], [-287, -38], [-256, -67],
  [-221, -64], [-197, -102], [-254, -120], [-315, -108], [-376, -127],
  [-410, -157], [-398, -184], [-370, -191], [-335, -191], [-285, -191],
];

const flatSurface = z => ({ y: 0, z, sin: 0, cos: 1, hover: 0 });
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export const summitJump = { launch: -349, landing: -227, centerZ: -191, halfSpan: 16, height: 24 };

// The two straights and their left-hand hairpin share one vertical plane.
// The driver steers across that plane using the same coordinates as a flat road.
function summitSurface(z, x) {
  const { launch, centerZ, halfSpan, height } = summitJump;
  if (z < 74) {
    const west = smooth((-x - 65) / 306);
    const approach = west * (height - 3);
    const runway = smooth((centerZ + 63 - z) / (63 - halfSpan));
    const lip = (1 - smooth((launch - x) / 23)) * 3;
    const elevation = x < launch ? approach + (height - approach - 3 + lip) * runway :
      approach * (1 - runway);
    const fade = clamp01((74 - z) / 24);
    const weight = smooth(fade);
    const y = elevation * weight;
    const slope = (x < launch ? height - approach - 3 + lip : -approach) * weight *
      (z < centerZ + 63 && z > centerZ + halfSpan ?
        -6 * ((centerZ + 63 - z) / (63 - halfSpan)) * (1 - (centerZ + 63 - z) / (63 - halfSpan)) / (63 - halfSpan) : 0) -
      elevation * 6 * fade * (1 - fade) / 24;
    const span = Math.hypot(1, slope);
    return { y, z, sin: slope / span, cos: 1 / span, hover: 0,
      slopeX: x > launch - 23 && x < launch && z < centerZ + halfSpan ? 0.12 : 0 };
  }
  const radius = 18;
  const corner = Math.PI * radius / 2;
  const rise = z - 74;
  const hover = smooth(rise / 19);
  if (rise < corner) {
    const angle = rise / radius;
    return { y: radius * (1 - Math.cos(angle)), z: 74 + radius * Math.sin(angle),
      sin: Math.sin(angle), cos: Math.cos(angle), hover };
  }
  return { y: radius + rise - corner, z: 74 + radius, sin: 1, cos: 0, hover: 1 };
}

function spline(a, b, c, d, t) {
  return 0.5 * (2 * b + (c - a) * t +
    (2 * a - 5 * b + 4 * c - d) * t ** 2 +
    (3 * b - a - 3 * c + d) * t ** 3);
}

function buildTrack({ id, name, tagline, anchors, startIndex, itemRows, profile = flatSurface, narrowed = [], jump }) {
  const points = anchors.flatMap((point, i) => {
    const previous = anchors[(i + anchors.length - 1) % anchors.length];
    const next = anchors[(i + 1) % anchors.length];
    const after = anchors[(i + 2) % anchors.length];
    return Array.from({ length: 18 }, (_, j) => point.map((value, axis) =>
      spline(previous[axis], value, next[axis], after[axis], j / 18)));
  });
  points.push(points[0]);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(
      points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }

  const courseLength = lengths.at(-1);
  const count = Math.round(courseLength / 2);
  const step = courseLength / count;
  const samples = Array.from({ length: count }, (_, i) => {
    const distance = i * step;
    const next = lengths.findIndex(length => length > distance);
    const blend = (distance - lengths[next - 1]) / (lengths[next] - lengths[next - 1]);
    return points[next - 1].map((value, axis) => value + (points[next][axis] - value) * blend);
  });

  function coursePoint(index, offset = 0, height = 0) {
    const i = (index + count) % count;
    const previous = samples[(i + count - 1) % count];
    const next = samples[(i + 1) % count];
    const dx = next[0] - previous[0];
    const dz = next[1] - previous[1];
    const span = Math.hypot(dx, dz);
    return [samples[i][0] + offset * dz / span, height, samples[i][1] - offset * dx / span];
  }

  const centerline = samples.map((_, index) => coursePoint(index));
  function widthAt(index) {
    const progress = ((index % count) + count) % count / count;
    let width = halfRoad;
    for (const [start, end] of narrowed) {
      width -= 2.45 * smooth(Math.min(progress - start, end - progress) / 0.024);
    }
    return width;
  }

  function surfacePoint(x, z, height = 0) {
    const surface = profile(z, x);
    return [x, surface.y + height * surface.cos, surface.z - height * surface.sin];
  }
  const [startX, , startZ] = centerline[startIndex];
  const [nextX, , nextZ] = centerline[startIndex + 1];
  const start = { x: startX, z: startZ, yaw: Math.atan2(nextX - startX, nextZ - startZ) };

  const cellSize = 12;
  const indexedRadius = wallOffset + 6;
  const roadCells = new Map();
  const segments = samples.map(([ax, az], i) => {
    const [bx, bz] = samples[(i + 1) % count];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const segment = { i, ax, az, dx, dz, lengthSquared: dx * dx + dz * dz,
      forwardX: dx / length, forwardZ: dz / length };
    for (let row = Math.floor((Math.min(az, bz) - indexedRadius) / cellSize);
      row <= Math.floor((Math.max(az, bz) + indexedRadius) / cellSize); row++) {
      if (!roadCells.has(row)) roadCells.set(row, new Map());
      const columns = roadCells.get(row);
      for (let column = Math.floor((Math.min(ax, bx) - indexedRadius) / cellSize);
        column <= Math.floor((Math.max(ax, bx) + indexedRadius) / cellSize); column++) {
        if (!columns.has(column)) columns.set(column, []);
        columns.get(column).push(segment);
      }
    }
    return segment;
  });

  function nearestRoad(x, z) {
    const nearby = roadCells.get(Math.floor(z / cellSize))?.get(Math.floor(x / cellSize));
    const result = closestSegment(x, z, nearby ?? segments);
    // Beyond the index's guaranteed radius, a segment outside this cell could be closer.
    return nearby && result.distance >= indexedRadius ? closestSegment(x, z, segments) : result;
  }

  function closestSegment(x, z, candidates) {
    let nearest = Infinity;
    let roadX = 0;
    let roadZ = 0;
    let forwardX = 0;
    let forwardZ = 0;
    let index = 0;
    for (const { i, ax, az, dx, dz, lengthSquared, forwardX: fx, forwardZ: fz } of candidates) {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
      const px = ax + dx * t;
      const pz = az + dz * t;
      const distance = (x - px) ** 2 + (z - pz) ** 2;
      if (distance < nearest) {
        nearest = distance;
        roadX = px;
        roadZ = pz;
        forwardX = fx;
        forwardZ = fz;
        index = i + t;
      }
    }
    return { x: roadX, z: roadZ, index, distance: Math.sqrt(nearest), forwardX, forwardZ };
  }

  function roadDistance(x, z) {
    return nearestRoad(x, z).distance;
  }

  // Contour the distance to the road so the inside barriers stay smooth where
  // a simple offset curve would fold over on itself in the tightest bends.
  function buildWalls() {
    const grid = 3;
    const margin = wallOffset + 2 * grid;
    const left = Math.min(...samples.map(([x]) => x)) - margin;
    const bottom = Math.min(...samples.map(([, z]) => z)) - margin;
    const columns = Math.ceil((Math.max(...samples.map(([x]) => x)) + margin - left) / grid) + 1;
    const rows = Math.ceil((Math.max(...samples.map(([, z]) => z)) + margin - bottom) / grid) + 1;
    const field = new Float64Array(columns * rows).fill(margin ** 2);
    for (let i = 0; i < centerline.length; i++) {
      const [ax, , az] = centerline[i];
      const [bx, , bz] = centerline[(i + 1) % centerline.length];
      const dx = bx - ax;
      const dz = bz - az;
      const inverseLength = 1 / (dx * dx + dz * dz);
      const rowStart = Math.max(0, Math.floor((Math.min(az, bz) - margin - bottom) / grid));
      const rowEnd = Math.min(rows - 1, Math.ceil((Math.max(az, bz) + margin - bottom) / grid));
      const colStart = Math.max(0, Math.floor((Math.min(ax, bx) - margin - left) / grid));
      const colEnd = Math.min(columns - 1, Math.ceil((Math.max(ax, bx) + margin - left) / grid));
      for (let row = rowStart; row <= rowEnd; row++) {
        for (let col = colStart; col <= colEnd; col++) {
          const x = left + col * grid - ax;
          const z = bottom + row * grid - az;
          const t = Math.max(0, Math.min(1, (x * dx + z * dz) * inverseLength));
          const fieldIndex = row * columns + col;
          field[fieldIndex] = Math.min(field[fieldIndex], (x - dx * t) ** 2 + (z - dz * t) ** 2);
        }
      }
    }

    const segments = [];
    const threshold = wallOffset ** 2;
    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < columns - 1; col++) {
        const i = row * columns + col;
        const values = [field[i], field[i + 1], field[i + columns + 1], field[i + columns]];
        const inside = values.map(value => value < threshold);
        if (inside.every(flag => flag === inside[0])) continue;
        const x = left + col * grid;
        const z = bottom + row * grid;
        const corners = [[x, z], [x + grid, z], [x + grid, z + grid], [x, z + grid]];
        const crossings = [];
        for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4;
          if (inside[edge] === inside[next]) continue;
          const t = (threshold - values[edge]) / (values[next] - values[edge]);
          crossings.push(corners[edge].map((value, axis) => value + (corners[next][axis] - value) * t));
        }
        if (crossings.length === 2) segments.push(crossings);
        else {
          const centerInside = values.reduce((sum, value) => sum + value, 0) / 4 < threshold;
          if (centerInside === inside[0]) segments.push(crossings.slice(0, 2), crossings.slice(2));
          else segments.push([crossings[0], crossings[3]], crossings.slice(1, 3));
        }
      }
    }
    return segments;
  }

  const wallSegments = buildWalls();
  const minX = Math.min(...samples.map(([x]) => x)) - wallOffset;
  const maxX = Math.max(...samples.map(([x]) => x)) + wallOffset;
  const minZ = Math.min(...samples.map(([, z]) => z)) - wallOffset;
  const maxZ = Math.max(...samples.map(([, z]) => z)) + wallOffset;
  const mapScale = Math.min(110 / (maxX - minX), 90 / (maxZ - minZ));
  function mapPoint(x, z) {
    return [60 + (x - (minX + maxX) / 2) * mapScale, 50 - (z - (minZ + maxZ) / 2) * mapScale];
  }

  return {
    id, name, tagline, count, step, courseLength, centerline, start, startIndex,
    finish: startIndex + 10, itemRows, jump, elevated: profile !== flatSurface, bounds: { minX, maxX, minZ, maxZ },
    coursePoint, nearestRoad, roadDistance, wallSegments, mapPoint, profile, surfacePoint, widthAt,
  };
}

export const tracks = {
  coast: buildTrack({
    id: 'coast', name: 'Sunbreak Coast', tagline: 'Beach hairpin and an inland S-bend',
    anchors: coastAnchors, startIndex: 14, itemRows: [0.09, 0.33, 0.56, 0.82],
  }),
  stadium: buildTrack({
    id: 'stadium', name: 'Apex Stadium', tagline: 'Grandstand straight, chicane and infield hairpin',
    anchors: stadiumAnchors, startIndex: 26, itemRows: [0.10, 0.37, 0.61, 0.85],
  }),
  summit: buildTrack({
    id: 'summit', name: 'Summit Circuit', tagline: 'Switchbacks, vertical climbs and a high U-turn',
    anchors: summitAnchors, startIndex: 27, itemRows: [0.06, 0.24, 0.39, 0.57, 0.72, 0.88],
    profile: summitSurface, narrowed: [[0.18, 0.30], [0.63, 0.73], [0.79, 0.92]], jump: summitJump,
  }),
};
export const trackList = Object.values(tracks);
