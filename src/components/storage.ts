import fs from 'fs';
import path from 'path';

export async function writeFileAtomic(dir: string, name: string, data: string, mode = 0o600) {
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `${name}.tmp`);
  const final = path.join(dir, name);
  await fs.promises.writeFile(tmp, data, { mode });
  await fs.promises.rename(tmp, final);
}

export async function readFileIfExists(filePath: string) {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export type CertFiles = {
  privkeyPem: string;
  certPem: string;
  chainPem?: string;
  fullchainPem?: string;
};

export type CertMeta = {
  domains: string[];
  issuedAt?: string; // ISO
  expiresAt?: string; // ISO
  acmeAccount?: string;
  keyType?: string;
  orderUrl?: string;
  lastResult?: { success: boolean; ts: string; message?: string };
};

/**
 * Write certificate files for a chore into the storage directory.
 * Layout:
 *  <base>/chores/<choreId>/privkey.pem
 *                     cert.pem
 *                     chain.pem
 *                     fullchain.pem
 *                     meta.json
 */
export async function writeCertificateFiles(base: string, choreId: string, files: CertFiles, meta: CertMeta) {
  const dir = path.join(base, 'chores', choreId);
  await fs.promises.mkdir(dir, { recursive: true });
  // Write private key (owner-only)
  await writeFileAtomic(dir, 'privkey.pem', files.privkeyPem, 0o600);
  // certs (0644)
  await writeFileAtomic(dir, 'cert.pem', files.certPem, 0o644);
  if (files.chainPem) await writeFileAtomic(dir, 'chain.pem', files.chainPem, 0o644);
  if (files.fullchainPem) await writeFileAtomic(dir, 'fullchain.pem', files.fullchainPem, 0o644);
  // meta.json
  const metaJson = JSON.stringify(meta, null, 2);
  await writeFileAtomic(dir, 'meta.json', metaJson, 0o644);
}

export async function readCertificateFiles(base: string, choreId: string) {
  const dir = path.join(base, 'chores', choreId);
  const priv = await readFileIfExists(path.join(dir, 'privkey.pem'));
  const cert = await readFileIfExists(path.join(dir, 'cert.pem'));
  const chain = await readFileIfExists(path.join(dir, 'chain.pem'));
  const full = await readFileIfExists(path.join(dir, 'fullchain.pem'));
  const metaRaw = await readFileIfExists(path.join(dir, 'meta.json'));
  const meta = metaRaw ? JSON.parse(metaRaw) : null;
  if (!priv || !cert) return null;
  return { files: { privkeyPem: priv, certPem: cert, chainPem: chain || undefined, fullchainPem: full || undefined }, meta } as { files: CertFiles; meta: CertMeta | null };
}
