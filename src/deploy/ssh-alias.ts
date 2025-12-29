import { Handler } from './registry';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
const execFileAsync = promisify(execFile);

export interface SshAliasParams {
  sshHostAlias: string;
  docroot?: string;
  targetPath?: string;
  fileNameTemplate?: string;
  permissions?: string;
}

function assertString(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new Error(`${name} must be a non-empty string`);
  return v;
}

export function createSshAliasHandler(params: Record<string, unknown> | undefined): Handler {
  if (!params) throw new Error('ssh-alias requires params');
  const sshHostAlias = assertString(params.sshHostAlias, 'params.sshHostAlias');
  const docroot = typeof params.docroot === 'string' ? params.docroot : undefined;
  const targetPath = typeof params.targetPath === 'string' ? params.targetPath : '.well-known/acme-challenge';
  const fileNameTemplate = typeof params.fileNameTemplate === 'string' ? params.fileNameTemplate : '{{token}}';
  const permissions = typeof params.permissions === 'string' ? params.permissions : undefined;

  return {
    validateParams(p) {
      if (!p || typeof p.sshHostAlias !== 'string') throw new Error('ssh-alias params.sshHostAlias is required');
    },
    async deploy(chore, domain, challenge) {
      const remoteDocroot = docroot || chore.docroot;
      const remotePath = `${remoteDocroot.replace(/\/+$/, '')}/${targetPath.replace(/^\/+/, '')}`;
      const fileName = fileNameTemplate.replace('{{token}}', challenge.token);
      const localTmp = path.join('/tmp', `letsrenew-${fileName}`);
      await fs.promises.writeFile(localTmp, challenge.keyAuthorization, { mode: 0o600 });
      // ensure remote directory
      await execFileAsync('ssh', ['-oBatchMode=yes', sshHostAlias, 'mkdir', '-p', remotePath]);
      // scp the file
      await execFileAsync('scp', ['-oBatchMode=yes', localTmp, `${sshHostAlias}:${remotePath}/${fileName}`]);
      if (permissions) {
        await execFileAsync('ssh', ['-oBatchMode=yes', sshHostAlias, 'chmod', permissions, `${remotePath}/${fileName}`]);
      }
      await fs.promises.unlink(localTmp).catch(() => {});
    },
    async cleanup(chore, domain, challenge) {
      const remoteDocroot = docroot || chore.docroot;
      const remotePath = `${remoteDocroot.replace(/\/+$/, '')}/${targetPath.replace(/^\/+/, '')}`;
      const fileName = fileNameTemplate.replace('{{token}}', challenge.token);
      await execFileAsync('ssh', ['-oBatchMode=yes', sshHostAlias, 'rm', '-f', `${remotePath}/${fileName}`]);
    }
  };
}

