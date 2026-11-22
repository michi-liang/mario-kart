// QR Code Model 2, version 5-L, byte mode. The pairing URL fits in its
// 106-byte payload, and this version uses a single Reed–Solomon block.
export function qrSvg(value) {
  const bytes = Buffer.from(value);
  if (bytes.length > 106) throw new RangeError('Pairing URL exceeds QR capacity');
  const bits = [];
  function append(number, width) {
    for (let bit = width - 1; bit >= 0; bit--) bits.push((number >> bit) & 1);
  }
  append(4, 4);
  append(bytes.length, 8);
  for (const byte of bytes) append(byte, 8);
  append(0, 4);
  const words = [];
  for (let i = 0; i < bits.length; i += 8) {
    words.push(bits.slice(i, i + 8).reduce((word, bit) => word * 2 + bit, 0));
  }
  for (let pad = 0; words.length < 108; pad++) words.push(pad % 2 ? 17 : 236);

  function multiply(a, b) {
    let product = 0;
    for (; b; b >>>= 1) {
      if (b & 1) product ^= a;
      a <<= 1;
      if (a & 256) a ^= 285;
    }
    return product;
  }
  let generator = [1];
  for (let root = 1; generator.length <= 26; root = multiply(root, 2)) {
    generator = [1, ...generator.map((coefficient, i) =>
      (generator[i + 1] ?? 0) ^ multiply(coefficient, root))];
  }
  const remainder = [...words, ...Array(26).fill(0)];
  for (let i = 0; i < words.length; i++) {
    const leading = remainder[i];
    for (let j = 0; j < generator.length; j++) {
      remainder[i + j] ^= multiply(generator[j], leading);
    }
  }
  words.push(...remainder.slice(-26));

  const size = 37;
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));
  function target(cx, cy, radius, whiteRing) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) {
          matrix[y][x] = ring !== whiteRing && ring !== 4;
        }
      }
    }
  }
  for (let i = 0; i < size; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }
  target(3, 3, 4, 2);
  target(size - 4, 3, 4, 2);
  target(3, size - 4, 4, 2);
  target(30, 30, 2, 1);

  const format = 0x77c4; // Format code for error correction L and mask 0.
  function formatBit(x, y, index) {
    matrix[y][x] = (format >> index) & 1;
  }
  for (let i = 0; i < 6; i++) formatBit(8, i, i);
  formatBit(8, 7, 6);
  formatBit(8, 8, 7);
  formatBit(7, 8, 8);
  for (let i = 9; i < 15; i++) formatBit(14 - i, 8, i);
  for (let i = 0; i < 8; i++) formatBit(size - 1 - i, 8, i);
  for (let i = 8; i < 15; i++) formatBit(8, size - 15 + i, i);
  matrix[size - 8][8] = true;

  let bit = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let offset = 0; offset < size; offset++) {
      const y = upward ? size - 1 - offset : offset;
      for (let x = right; x >= right - 1; x--) {
        if (matrix[y][x] !== null) continue;
        const data = ((words[bit >> 3] ?? 0) >> (7 - bit % 8)) & 1;
        matrix[y][x] = data ^ ((x + y) % 2 === 0);
        bit++;
      }
    }
    upward = !upward;
  }
  const path = matrix.flatMap((row, y) => row.map((dark, x) =>
    dark ? `M${x + 4} ${y + 4}h1v1h-1z` : '')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h45v45H0z"/><path fill="#10181c" d="${path}"/></svg>`;
}
