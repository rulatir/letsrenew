#!/usr/bin/env bun
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { writeCertificateFiles, CertFiles, CertMeta } from '../components/storage';
import { execFileSync } from 'child_process';
import { Config } from '../models/types';

function usage() {
  console.error('Usage: import-certbot [source] <chore-id> [certStorageDir]');
  console.error('source may be omitted if the chore config contains importFrom. source format: localDir or host:/absolute/path');
  console.error('Examples:');
  console.error('  import local: bun src/tools/import-certbot.ts /etc/letsencrypt/live/example.com site-example /data/letsrenew');
  console.error('  import remote via SSH host alias: bun src/tools/import-certbot.ts web.example.com:/etc/letsencrypt/live/example.com site-example /data/letsrenew');
  console.error('  import using chore.importFrom: bun src/tools/import-certbot.ts site-example /data/letsrenew');
}

const args = process.argv.slice(2);
if (args.length < 1) {
  usage();
  process.exit(2);
}

let sourceArg: string | undefined;
let choreId: string;
let base = './data/letsrenew';

if (args.length === 1) {
  // only chore-id provided
  choreId = args[0];
} else if (args.length === 2) {
  // could be (source, choreId) or (choreId, base)
  if (args[0].includes(':') || args[0].startsWith('/') ) {
    sourceArg = args[0];
    choreId = args[1];
  } else {
    choreId = args[0];
    base = args[1];
  }
} else {
  // >=3
  sourceArg = args[0];
  choreId = args[1];
  base = args[2] || base;
}

function isRemote(spec: string) {
  const idx = spec.indexOf(':');
  if (idx === -1) return false;
  const after = spec.slice(idx + 1);
  return after.startsWith('/');
}

function splitRemote(spec: string): { host: string; remotePath: string } {
  const idx = spec.indexOf(':');
  if (idx === -1) throw new Error('not a remote spec');
  return { host: spec.slice(0, idx), remotePath: spec.slice(idx + 1) };
}

async function readPem(spec: string) {
  if (!isRemote(spec)) {
    try {
      return fs.readFileSync(spec, 'utf8');
    } catch (err) {
      return null;
    }
  }
  const { host, remotePath } = splitRemote(spec);
  try {
    const outBuf = execFileSync('ssh', ['-oBatchMode=yes', host, 'cat', remotePath]);
    return outBuf.toString();
  } catch (err) {
    return null;
  }
}

function makePathFor(spec: string, fileName: string) {
  if (isRemote(spec)) return `${spec.replace(/\/+$/, '')}/${fileName}`;
  return path.join(spec, fileName);
}

function findImportFromInConfig(choreId: string): string | null {
  const cfgPath = process.env.LETSRENEW_CONFIG || '/etc/letsrenew/config.yml';
  if (!fs.existsSync(cfgPath)) return null;
  try {
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const cfg = yaml.load(raw) as Config;
    const chore = (cfg.chores || []).find(c => c.id === choreId);
    if (!chore) return null;
    return chore.importFrom || null;
  } catch (err) {
    return null;
  }
}

(async () => {
  if (!sourceArg) {
    const found = findImportFromInConfig(choreId);
    if (!found) {
      console.error('No source provided and chore.importFrom not set; cannot import.');
      usage();
      process.exit(2);
    }
    sourceArg = found;
    console.log('Using importFrom from config:', sourceArg);
  }

  const priv = await readPem(makePathFor(sourceArg, 'privkey.pem'));
  const cert = await readPem(makePathFor(sourceArg, 'cert.pem'));
  const chain = (await readPem(makePathFor(sourceArg, 'chain.pem'))) || (await readPem(makePathFor(sourceArg, 'fullchain.pem')));
  const full = (await readPem(makePathFor(sourceArg, 'fullchain.pem'))) || (cert && chain ? cert + '\n' + chain : null);

  if (!priv || !cert) {
    console.error('source does not contain privkey.pem and cert.pem');
    process.exit(2);
  }

  const files: CertFiles = { privkeyPem: priv, certPem: cert, chainPem: chain || undefined, fullchainPem: full || undefined };

  // Attempt to build minimal meta from cert.pem using openssl if available locally
  let domains: string[] = [];
  try {
    const certPemPath = makePathFor(sourceArg, 'cert.pem');
    let outBuf: Buffer;
    if (isRemote(sourceArg)) {
      const { host, remotePath } = splitRemote(certPemPath);
      outBuf = execFileSync('ssh', ['-oBatchMode=yes', host, 'openssl', 'x509', '-in', remotePath, '-noout', '-text']);
    } else {
      outBuf = execFileSync('openssl', ['x509', '-in', certPemPath, '-noout', '-text']);
    }
    const out = outBuf.toString();
    const lines = out.split('\n');
    const dnsLines = lines.filter((l: string) => l.includes('DNS:'));
    if (dnsLines.length > 0) {
      const dns = dnsLines.map((l: string) => l.trim()).join(',');
      domains = dns.split(/DNS:/).map((s: string) => s.trim()).filter(Boolean).map((s: string) => s.replace(/,?$/, ''));
    }
  } catch (err) {
    // ignore - optional
  }

  const meta: CertMeta = { domains, issuedAt: new Date().toISOString(), lastResult: { success: true, ts: new Date().toISOString() } };

  try {
    await writeCertificateFiles(base, choreId, files, meta);
    console.log('Imported certs to', path.join(base, 'chores', choreId));
  } catch (err) {
    console.error('Failed to import:', err);
    process.exit(2);
  }
})();
