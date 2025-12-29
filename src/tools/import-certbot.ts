#!/usr/bin/env bun
import fs from 'fs';
import path from 'path';
import { writeCertificateFiles, CertFiles, CertMeta } from '../components/storage';

if (process.argv.length < 4) {
  console.error('Usage: import-certbot <live-dir> <chore-id> [certStorageDir]');
  process.exit(2);
}

const liveDir = process.argv[2];
const choreId = process.argv[3];
const base = process.argv[4] || './data/certs';

function readPem(file: string) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return null;
  }
}

const priv = readPem(path.join(liveDir, 'privkey.pem'));
const cert = readPem(path.join(liveDir, 'cert.pem'));
const chain = readPem(path.join(liveDir, 'chain.pem')) || readPem(path.join(liveDir, 'fullchain.pem'));
const full = readPem(path.join(liveDir, 'fullchain.pem')) || (cert && chain ? cert + '\n' + chain : null);

if (!priv || !cert) {
  console.error('live dir does not contain privkey.pem and cert.pem');
  process.exit(2);
}

const files: CertFiles = { privkeyPem: priv, certPem: cert, chainPem: chain || undefined, fullchainPem: full || undefined };

// Attempt to build minimal meta from cert.pem
let domains: string[] = [];
try {
  // crude parsing: search for Subject Alternative Name in cert text via openssl
  const { stdout } = Bun.spawnSync(['openssl', 'x509', '-in', path.join(liveDir, 'cert.pem'), '-noout', '-text']);
  const out = stdout.toString();
  const sanMatch = out.match(/X509v3 Subject Alternative Name:[\s\S]*?\n\s*(?:DNS:[^,\n]+(?:, )?)+/i);
  if (sanMatch) {
    const dns = out.split('\n').filter(l => l.includes('DNS:')).map(l => l.trim()).join(',');
    domains = dns.split(/DNS:/).map(s => s.trim()).filter(Boolean).map(s => s.replace(/,?$/, ''));
  }
} catch (err) {
  // ignore; user can supply domains in meta after import
}

const meta: CertMeta = { domains, issuedAt: new Date().toISOString(), lastResult: { success: true, ts: new Date().toISOString() } };

(async () => {
  try {
    await writeCertificateFiles(base, choreId, files, meta);
    console.log('Imported certs to', path.join(base, 'chores', choreId));
  } catch (err) {
    console.error('Failed to import:', err);
    process.exit(2);
  }
})();

