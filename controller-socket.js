import { createHash } from 'node:crypto';

const maxMessage = 256;
const websocketGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function acceptControllerSocket(request, socket, head, receive) {
  const key = request.headers['sec-websocket-key'];
  if (request.method !== 'GET' || request.headers.upgrade?.toLowerCase() !== 'websocket' ||
      request.headers['sec-websocket-version'] !== '13' || typeof key !== 'string' ||
      !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return;
  }

  const accept = createHash('sha1').update(key + websocketGuid).digest('base64');
  socket.setNoDelay(true);
  socket.setTimeout(5000);
  socket.on('timeout', () => socket.destroy());
  socket.on('error', () => socket.destroy());
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n' +
    'Connection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');

  function frame(opcode, payload) {
    let header;
    if (payload.length < 126) header = Buffer.from([0x80 | opcode, payload.length]);
    else {
      header = Buffer.from([0x80 | opcode, 126, 0, 0]);
      header.writeUInt16BE(payload.length, 2);
    }
    return Buffer.concat([header, payload]);
  }

  let pending = Buffer.alloc(0);
  let closed = false;
  function finish(payload) {
    closed = true;
    socket.end(frame(8, payload));
  }
  function reject(code) {
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code);
    finish(payload);
  }
  function consume(chunk) {
    if (closed) return;
    if (pending.length + chunk.length > 8192) return reject(1009);
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= 2) {
      const opcode = pending[0] & 0x0f;
      const isControl = opcode >= 8;
      let length = pending[1] & 0x7f;
      let offset = 2;
      // Controllers only send small, complete JSON messages and control frames.
      if ((pending[0] & 0xf0) !== 0x80 || !(pending[1] & 0x80) ||
          ![1, 8, 9, 10].includes(opcode) || (isControl && length > 125)) return reject(1002);
      if (length === 127) return reject(1009);
      if (length === 126) {
        if (pending.length < 4) return;
        length = pending.readUInt16BE(2);
        offset = 4;
        if (length < 126) return reject(1002);
      }
      if (length > maxMessage) return reject(1009);
      if (pending.length < offset + 4 + length) return;
      const message = Buffer.allocUnsafe(length);
      for (let i = 0; i < length; i++) message[i] = pending[offset + 4 + i] ^ pending[offset + i % 4];
      pending = pending.subarray(offset + 4 + length);
      if (opcode === 8) {
        if (length === 1) return reject(1002);
        return finish(message);
      }
      if (socket.writableLength > 8192) return socket.destroy();
      if (opcode === 9) socket.write(frame(10, message));
      if (opcode !== 1) continue;
      let data;
      try {
        data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(message));
      } catch {
        return reject(1007);
      }
      socket.write(frame(1, Buffer.from(JSON.stringify(receive(data)))));
    }
  }
  socket.on('data', consume);
  if (head.length) consume(head);
}
