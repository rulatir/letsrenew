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

