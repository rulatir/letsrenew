#!/usr/bin/env bun
import { ensureDefaultSshKey } from './tools/generate-default-ssh-key';
import { loadConfig } from './components/config-loader';
import { registerHandler } from './deploy/registry';
import { createSshAliasHandler } from './deploy/ssh-alias';
import fs from 'fs';

registerHandler('ssh-alias', { factory: (params) => createSshAliasHandler(params) });

(async () => {
  try {
    // Ensure default SSH identity exists if none present
    await ensureDefaultSshKey(process.env.HOME || '/home/letsrenew', { generateRsaFallback: true });
  } catch (err: any) {
    console.error('Warning: failed to ensure default SSH key:', err.message || err);
  }

  const args = process.argv.slice(2);
  // CLI accepts optional config path as first arg; otherwise loadConfig() will use LETSRENEW_CONFIG or /etc/letsrenew/config.yml
  const configPath = args[0];
  let cfg;
  try {
    cfg = loadConfig(configPath);
  } catch (err: any) {
    console.error('Failed to load config:', err.message || err);
    process.exit(2);
  }
  console.log('Loaded config with', cfg.chores.length, 'chores');
})();
