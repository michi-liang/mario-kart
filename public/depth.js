// Draw camera-space triangles into a reusable transparent canvas with a depth
// buffer. This keeps the 2D HUD and sky while giving the elevated road real occlusion.
export function createDepthLayer() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true });
  if (!gl) return null;
  const shader = (type, source) => {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
    return result;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, `
    attribute vec3 point;
    attribute vec3 color;
    uniform vec2 lens;
    varying vec3 tint;
    void main() {
      tint = color;
      gl_Position = vec4(point.xy * lens, point.z * 1.0005 - 0.60015, point.z);
    }`));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 tint;
    void main() { gl_FragColor = vec4(tint, 1.0); }`));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  const buffer = gl.createBuffer();
  const lens = gl.getUniformLocation(program, 'lens');
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [attribute, offset] of [['point', 0], ['color', 12]]) {
    const index = gl.getAttribLocation(program, attribute);
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, 3, gl.FLOAT, false, 24, offset);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  const colors = new Map();
  let vertices = new Float32Array(65536);

  function draw(faces, width, height, focal, destination, pixels) {
    if (gl.isContextLost()) return false;
    if (canvas.width !== pixels[0] || canvas.height !== pixels[1]) {
      [canvas.width, canvas.height] = pixels;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(lens, 2 * focal / width, 2 * focal / height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    let used = 0;
    for (const { points, color } of faces) {
      let rgb = colors.get(color);
      if (!rgb) {
        const hex = color.length === 4 ? [...color.slice(1)].map(ch => ch.repeat(2)).join('') : color.slice(1, 7);
        const raw = Number.parseInt(hex, 16);
        rgb = [(raw >> 16) / 255, ((raw >> 8) & 255) / 255, (raw & 255) / 255];
        colors.set(color, rgb);
      }
      const size = used + (points.length - 2) * 18;
      if (size > vertices.length) {
        const expanded = new Float32Array(Math.max(size, vertices.length * 2));
        expanded.set(vertices);
        vertices = expanded;
      }
      for (let i = 1; i + 1 < points.length; i++) {
        for (let j = 0; j < 3; j++) {
          const p = points[j === 0 ? 0 : i + j - 1];
          vertices[used++] = p[0];
          vertices[used++] = p[1];
          vertices[used++] = p[2];
          vertices[used++] = rgb[0];
          vertices[used++] = rgb[1];
          vertices[used++] = rgb[2];
        }
      }
    }
    gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, used), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, used / 6);
    destination.drawImage(canvas, 0, 0, width, height);
    return true;
  }
  return { draw };
}
