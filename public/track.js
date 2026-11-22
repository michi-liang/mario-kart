export const halfRoad = 8.28;
export const wallOffset = halfRoad + 7.5;

// Closed spline through an original coast road, with a long launch straight,
// an inland S-bend, and a hairpin above the beach.
const anchors = [
  [-53, -40], [-53, -9], [-45, 11], [-57, 29], [-49, 44], [-34, 54], [-3, 46],
  [17, 23], [43, 24], [63, 49], [83, 32], [81, 3],
  [64, -17], [41, -19], [24, -40], [2, -52], [-27, -52],
].map(point => point.map(value => value * 1.72));

function spline(a, b, c, d, t) {
  return 0.5 * (2 * b + (c - a) * t +
    (2 * a - 5 * b + 4 * c - d) * t ** 2 +
    (3 * b - a - 3 * c + d) * t ** 3);
}

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

export const courseLength = lengths.at(-1);
const segmentCount = Math.round(courseLength / 2);
export const step = courseLength / segmentCount;
const samples = Array.from({ length: segmentCount }, (_, i) => {
  const distance = i * step;
  const next = lengths.findIndex(length => length > distance);
  const blend = (distance - lengths[next - 1]) / (lengths[next] - lengths[next - 1]);
  return points[next - 1].map((value, axis) => value + (points[next][axis] - value) * blend);
});

export function coursePoint(index, offset = 0, height = 0) {
  const i = (index + segmentCount) % segmentCount;
  const previous = samples[(i + segmentCount - 1) % segmentCount];
  const next = samples[(i + 1) % segmentCount];
  const dx = next[0] - previous[0];
  const dz = next[1] - previous[1];
  const span = Math.hypot(dx, dz);
  return [samples[i][0] + offset * dz / span, height, samples[i][1] - offset * dx / span];
}

export const centerline = samples.map((_, index) => coursePoint(index));
export const startIndex = 14;
const [startX, , startZ] = centerline[startIndex];
const [nextX, , nextZ] = centerline[startIndex + 1];
export const start = { x: startX, z: startZ, yaw: Math.atan2(nextX - startX, nextZ - startZ) };

export function nearestRoad(x, z) {
  let nearest = Infinity;
  let roadX = 0;
  let roadZ = 0;
  let forwardX = 0;
  let forwardZ = 0;
  for (let i = 0; i < centerline.length; i++) {
    const [ax, , az] = centerline[i];
    const [bx, , bz] = centerline[(i + 1) % centerline.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const distance = (x - px) ** 2 + (z - pz) ** 2;
    if (distance < nearest) {
      nearest = distance;
      roadX = px;
      roadZ = pz;
      forwardX = dx;
      forwardZ = dz;
    }
  }
  const segmentLength = Math.hypot(forwardX, forwardZ);
  return { x: roadX, z: roadZ, distance: Math.sqrt(nearest),
    forwardX: forwardX / segmentLength, forwardZ: forwardZ / segmentLength };
}

export function roadDistance(x, z) {
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
      const points = [];
      for (let edge = 0; edge < 4; edge++) {
        const next = (edge + 1) % 4;
        if (inside[edge] === inside[next]) continue;
        const t = (threshold - values[edge]) / (values[next] - values[edge]);
        points.push(corners[edge].map((value, axis) => value + (corners[next][axis] - value) * t));
      }
      if (points.length === 2) segments.push(points);
      else {
        const centerInside = values.reduce((sum, value) => sum + value, 0) / 4 < threshold;
        if (centerInside === inside[0]) segments.push(points.slice(0, 2), points.slice(2));
        else segments.push([points[0], points[3]], points.slice(1, 3));
      }
    }
  }
  return segments;
}

export const wallSegments = buildWalls();

const minX = Math.min(...samples.map(([x]) => x)) - wallOffset;
const maxX = Math.max(...samples.map(([x]) => x)) + wallOffset;
const minZ = Math.min(...samples.map(([, z]) => z)) - wallOffset;
const maxZ = Math.max(...samples.map(([, z]) => z)) + wallOffset;
const mapScale = Math.min(110 / (maxX - minX), 90 / (maxZ - minZ));
export function mapPoint(x, z) {
  return [60 + (x - (minX + maxX) / 2) * mapScale, 50 - (z - (minZ + maxZ) / 2) * mapScale];
}
