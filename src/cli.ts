#!/usr/bin/env bun
import { loadConfig } from './components/config-loader';
import { registerHandler } from './deploy/registry';
import { createSshAliasHandler } from './deploy/ssh-alias';
import fs from 'fs';

registerHandler('ssh-alias', { factory: (params) => createSshAliasHandler(params) });

const args = process.argv.slice(2);
const configPath = args[0] || './config.example.yml';
if (!fs.existsSync(configPath)) {
  console.error('config file not found:', configPath);
  process.exit(2);
}
const cfg = loadConfig(configPath);
console.log('Loaded config with', cfg.chores.length, 'chores');

