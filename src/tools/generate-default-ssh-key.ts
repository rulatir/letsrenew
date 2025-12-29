import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export async function ensureDefaultSshKey(homeDir?: string, opts?: { generateRsaFallback?: boolean }) {
  const HOME = homeDir || process.env.HOME || '/home/letsrenew';
  const sshDir = path.join(HOME, '.ssh');
  const privEd = path.join(sshDir, 'id_ed25519');
  const pubEd = privEd + '.pub';
  const privRsa = path.join(sshDir, 'id_rsa');
  const pubRsa = privRsa + '.pub';

  // If any usual identity exists, skip
  const usual = [privEd, privRsa, path.join(sshDir, 'id_ecdsa')];
  for (const f of usual) if (fs.existsSync(f)) return;

  // Ensure .ssh dir exists with correct perms
  try {
    fs.mkdirSync(sshDir, { recursive: true });
  } catch (err) {
    // ignore
  }
  try { fs.chmodSync(sshDir, 0o700); } catch (err) {}

  // Generate ed25519 key using system ssh-keygen
  try {
    execFileSync('ssh-keygen', ['-t', 'ed25519', '-f', privEd, '-N', '', '-C', `letsrenew@${require('os').hostname()}-${Date.now()}`], { stdio: 'inherit' });
    try { fs.chmodSync(privEd, 0o600); } catch (err) {}
    try { fs.chmodSync(pubEd, 0o644); } catch (err) {}
  } catch (err: any) {
    // If ssh-keygen failed, throw an error to surface
    throw new Error(`failed to generate ed25519 key: ${err.message || err}`);
  }

  if (opts && opts.generateRsaFallback) {
    if (!fs.existsSync(privRsa)) {
      try {
        execFileSync('ssh-keygen', ['-t', 'rsa', '-b', '4096', '-f', privRsa, '-N', '', '-C', `letsrenew-rsa@${require('os').hostname()}`], { stdio: 'inherit' });
        try { fs.chmodSync(privRsa, 0o600); } catch (err) {}
        try { fs.chmodSync(pubRsa, 0o644); } catch (err) {}
      } catch (err: any) {
        // don't treat RSA fallback failure as fatal; log and continue
        console.warn('failed to generate rsa fallback key:', err.message || err);
      }
    }
  }
}

