import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { isIPv4 } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function makeLanCertificate(address) {
  if (!isIPv4(address) || address === '127.0.0.1') {
    throw new Error('Connect to Wi-Fi or set LAN_HOST to your laptop’s Wi-Fi IPv4 address.');
  }
  const folder = fileURLToPath(new URL(`./.certs/${address}/`, import.meta.url));
  const keyPath = join(folder, 'server.key');
  const certPath = join(folder, 'server.crt');
  const caPath = join(folder, 'phone-root.crt');
  const opensslFromGit = join(process.env.ProgramFiles || 'C:/Program Files',
    'Git', 'mingw64', 'bin', 'openssl.exe');
  const openssl = process.env.OPENSSL || (process.platform === 'win32' && existsSync(opensslFromGit)
    ? opensslFromGit : 'openssl');
  function run(args) {
    return execFileSync(openssl, args, { windowsHide: true, stdio: 'pipe' });
  }
  let reusable = false;
  try {
    reusable = existsSync(keyPath) && existsSync(caPath) &&
      Boolean(run(['x509', '-checkend', '86400', '-noout', '-in', certPath]));
  } catch {
    // The certificate is expired or has not been generated yet.
  }
  if (!reusable) {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const rootKey = join(folder, 'root.key');
    const csr = join(folder, 'server.csr');
    try {
      run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '90',
        '-subj', '/CN=Pocket Circuit Local Test CA', '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
        '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', rootKey, '-out', caPath]);
      run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', `/CN=${address}`,
        '-addext', `subjectAltName=IP:${address}`, '-addext', 'extendedKeyUsage=serverAuth',
        '-addext', 'basicConstraints=critical,CA:FALSE', '-keyout', keyPath, '-out', csr]);
      run(['x509', '-req', '-sha256', '-days', '90', '-in', csr, '-CA', caPath, '-CAkey', rootKey,
        '-set_serial', '0x' + randomBytes(16).toString('hex'), '-copy_extensions', 'copy', '-out', certPath]);
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('Install OpenSSL 3 or set OPENSSL to its executable path.');
      throw new Error('Could not generate the local HTTPS certificate.\n' + (error.stderr || error.message));
    } finally {
      rmSync(rootKey, { force: true });
      rmSync(csr, { force: true });
    }
  }
  console.log(`Install this public certificate on your phone: ${caPath}`);
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}
