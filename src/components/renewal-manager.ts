import { Chore, Config } from '../models/types';
import { readCertificateFiles } from './storage';
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';

function sendMail(addresses: string[], subject: string, body: string) {
  // Try sendmail if available, otherwise fallback to console output
  try {
    const sendmail = '/usr/sbin/sendmail';
    if (fs.existsSync(sendmail)) {
      const proc = spawnSync(sendmail, ['-oi', ...addresses], { input: `Subject: ${subject}\n\n${body}` });
      if (proc.status !== 0) {
        console.error('sendmail failed:', proc.stderr?.toString());
      }
      return;
    }
  } catch (err) {
    // ignore and fallback
  }
  // fallback: try mailx
  try {
    const proc = spawnSync('mail', ['-s', subject, ...addresses], { input: body });
    if (proc.status === 0) return;
  } catch (err) {}
  // final fallback: log
  console.log('Mail to', addresses.join(','), 'subject:', subject, '\n', body);
}

export async function checkChoreAndAct(baseCertDir: string, cfg: Config, chore: Chore) {
  const existing = await readCertificateFiles(baseCertDir, chore.id);
  if (existing) {
    return { status: 'ok', message: 'certificate present' };
  }
  // no certificate present
  if (chore.importFrom) {
    // send mail to notify admin(s) that manual import is required
    const recipients = (chore.notifyOnFailure && chore.notifyOnFailure.length > 0) ? chore.notifyOnFailure : [];
    const subject = `letsrenew: manual import required for chore ${chore.id}`;
    const body = `The daemon could not find certificate files for chore ${chore.id} (domains: ${chore.domains.map(d=>d.name).join(', ')}).\n` +
                 `This chore has importFrom set to: ${chore.importFrom} .\n` +
                 `Please run the importer: import-certbot [source] ${chore.id} <certStorageDir>\n`;
    if (recipients.length === 0) {
      // log warning
      console.warn('No notifyOnFailure recipients configured for chore', chore.id, '; cannot send email. Intended subject:', subject);
      return { status: 'needs_import', message: 'no recipients configured', importFrom: chore.importFrom };
    }
    sendMail(recipients, subject, body);
    return { status: 'notified', message: 'admins notified to import', importFrom: chore.importFrom };
  }
  // importFrom not set -> proceed to request new certificate (placeholder)
  // Actual ACME request logic will be in ACMEClientAdapter + RenewalManager final implementation
  // For now we return a marker
  return { status: 'request_new_certificate', message: 'no existing cert; should request new certificate via ACME' };
}

