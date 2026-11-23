import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { qrSvg } from './qr.js';
import { makeLanCertificate } from './lan-certificate.js';
import { createRoom } from './room.js';

const tunnelMode = process.argv.includes('--tunnel');
const localHttps = process.argv.includes('--lan-https');
const displayPort = Number(process.env.DISPLAY_PORT || 8080);
const requestedPhonePort = Number(process.env.PHONE_PORT || 8081);
const key = process.env.TLS_KEY;
const cert = process.env.TLS_CERT;
if (Boolean(key) !== Boolean(cert) || (key && (tunnelMode || localHttps)) || (tunnelMode && localHttps)) {
  throw new Error('Choose --tunnel, --lan-https, or set TLS_KEY and TLS_CERT together.');
}
const primaryAdapter = ({ name }) => Number(/wi-fi|wireless|wlan|ethernet|en0/i.test(name) &&
  !/virtual|vethernet|vpn/i.test(name));
const lanAddresses = Object.entries(networkInterfaces())
  .flatMap(([name, addresses]) => addresses.map(address => ({ ...address, name })))
  .filter(address => address.family === 'IPv4' && !address.internal)
  .sort((a, b) => primaryAdapter(b) - primaryAdapter(a));
const lanHost = process.env.LAN_HOST || lanAddresses[0]?.address || '127.0.0.1';
const tls = localHttps ? makeLanCertificate(lanHost) :
  key && { key: readFileSync(key), cert: readFileSync(cert) };
const token = randomBytes(12).toString('base64url');
let origin;
let tunnelStatus = tunnelMode ? 'starting' : 'off';
const clients = new Set();
const room = createRoom();
let lastEvent;

const assets = new Map([
  ['/style.css', ['text/css', 'style.css']],
  ['/drive.js', ['text/javascript', 'drive.js']],
  ['/track.js', ['text/javascript', 'track.js']],
  ['/neon.js', ['text/javascript', 'neon.js']],
  ['/scenery.js', ['text/javascript', 'scenery.js']],
  ['/bots.js', ['text/javascript', 'bots.js']],
  ['/audio.js', ['text/javascript', 'audio.js']],
  ['/summit-music.m4a', ['audio/mp4', 'summit-music.m4a']],
  ['/depth.js', ['text/javascript', 'depth.js']],
  ['/roster.js', ['text/javascript', 'roster.js']],
  ['/race.js', ['text/javascript', 'race.js']],
  ['/track-items.js', ['text/javascript', 'track-items.js']],
  ['/controller.js', ['text/javascript', 'controller.js']],
  ['/', ['text/html', 'index.html']],
  ['/p', ['text/html', 'controller.html']],
].map(([path, [type, filename]]) =>
  [path, [type, readFileSync(new URL(`./public/${filename}`, import.meta.url))]]));

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}
function asset(res, path) {
  send(res, 200, ...assets.get(path));
}
function publish() {
  if (!clients.size) return;
  const event = `data: ${JSON.stringify(room.snapshot())}\n\n`;
  if (event === lastEvent) return;
  lastEvent = event;
  for (const res of clients) res.write(event);
}
function pairingUrl() {
  return `${origin}/p?k=${token}`;
}

const display = createServer((req, res) => {
  const { pathname } = new URL('http://localhost' + (req.url.startsWith('/') ? req.url : '/'));
  if (pathname === '/room' && req.method === 'POST') {
    // The host action is same-origin and served only on the loopback display.
    return readJson(req, res, data => {
      const accepted = room.host(data || {});
      if (accepted) publish();
      send(res, accepted ? 200 : 409, 'application/json', JSON.stringify(room.snapshot()));
    });
  }
  if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Method not allowed');
  if (pathname === '/pairing') {
    const url = pairingUrl();
    return send(res, 200, 'application/json', JSON.stringify({ url, tunnelStatus, localHttps }));
  }
  if (pathname === '/pairing.svg') return send(res, 200, 'image/svg+xml', qrSvg(pairingUrl()));
  if (pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    const event = `data: ${JSON.stringify(room.snapshot())}\n\n`;
    if (!clients.size) lastEvent = event;
    res.write(event);
    clients.add(res);
    res.on('close', () => clients.delete(res));
    return;
  }
  if (assets.has(pathname) && pathname !== '/p') return asset(res, pathname);
  send(res, 404, 'text/plain', 'Not found');
});
function controller(req, res) {
  const url = new URL('http://localhost' + (req.url.startsWith('/') ? req.url : '/'));
  if (req.method === 'GET' && ['/style.css', '/controller.js', '/roster.js'].includes(url.pathname)) {
    return asset(res, url.pathname);
  }
  if (url.searchParams.get('k') !== token) return send(res, 404, 'text/plain', 'Invalid pairing link');
  if (req.method === 'GET' && url.pathname === '/p') return asset(res, '/p');
  if (req.method !== 'POST' || url.pathname !== '/input') return send(res, 404, 'text/plain', 'Not found');
  readJson(req, res, data => {
    const result = room.input(data?.id, data);
    send(res, result.status, 'application/json', JSON.stringify(result));
  });
}

function readJson(req, res, callback) {
  if (req.headers['content-type'] !== 'application/json') {
    return send(res, 415, 'text/plain', 'Expected JSON');
  }
  let body = '';
  let oversized = false;
  req.on('error', () => {});
  req.on('data', chunk => {
    if (oversized) return;
    body += chunk;
    if (body.length > 256) {
      oversized = true;
      send(res, 413, 'text/plain', 'Input too large');
    }
  });
  req.on('end', () => {
    if (oversized) return;
    let controls;
    try {
      controls = JSON.parse(body);
    } catch {
      return send(res, 400, 'text/plain', 'Invalid input');
    }
    callback(controls);
  });
}
const phone = tls ? createSecureServer(tls, controller) : createServer(controller);

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = error => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

async function bindPort(server, port, host, setting) {
  try {
    return await listen(server, port, host);
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    if (process.env[setting]) {
      throw new Error(`Port ${port} is in use. Set ${setting} to an available port and try again.`);
    }
    const availablePort = await listen(server, 0, host);
    console.log(`Port ${port} is in use. Using port ${availablePort} instead.`);
    return availablePort;
  }
}

try {
  const phonePort = await bindPort(phone, requestedPhonePort, '0.0.0.0', 'PHONE_PORT');
  origin = `${tls ? 'https' : 'http'}://${lanHost}:${phonePort}`;
  const laptopPort = await bindPort(display, displayPort, '127.0.0.1', 'DISPLAY_PORT');
  console.log(`Laptop display: http://127.0.0.1:${laptopPort}`);
  console.log(`LAN controller: ${pairingUrl()}`);
  if (tunnelMode) startTunnel(phonePort);
} catch (error) {
  console.error(`Could not start Pocket Circuit: ${error.message}`);
  process.exit(1);
}

setInterval(publish, 33).unref();
setInterval(() => {
  for (const res of clients) res.write(': heartbeat\n\n');
}, 15000).unref();

function startTunnel(phonePort) {
  const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${phonePort}`], {
    windowsHide: true,
  });
  const fallback = origin;
  let recentOutput = '';
  for (const stream of [tunnel.stdout, tunnel.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      recentOutput = (recentOutput + chunk).slice(-8192);
      const match = recentOutput.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com(?=\s+\|)/i);
      if (match && tunnelStatus === 'starting') {
        origin = match[0];
        tunnelStatus = 'ready';
        clearTimeout(deadline);
        console.log('HTTPS controller URL is available on the laptop display.');
      }
    });
  }
  const deadline = setTimeout(() => {
    tunnel.kill();
  }, 22000);
  function unavailable() {
    clearTimeout(deadline);
    origin = fallback;
    if (tunnelStatus === 'failed') return;
    tunnelStatus = 'failed';
    console.log('HTTPS tunnel unavailable. The same-Wi-Fi controller is still available.');
    if (recentOutput) console.log(recentOutput.trim().split(/\r?\n/).slice(-3).join('\n'));
  }
  tunnel.on('error', unavailable);
  tunnel.on('exit', unavailable);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      tunnel.kill();
      process.exit(0);
    });
  }
  process.on('exit', () => tunnel.kill());
}
