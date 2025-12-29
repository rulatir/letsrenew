import fs from 'fs';
import yaml from 'js-yaml';
import { Config, DeploymentDescriptor } from '../models/types';
import { getHandlerEntry } from '../deploy/registry';

export function loadConfig(path: string): Config {
  const raw = fs.readFileSync(path, 'utf8');
  const cfg = yaml.load(raw) as Config;
  if (!cfg) throw new Error('failed to parse config');
  if (!Array.isArray(cfg.chores)) throw new Error('config.chores must be an array');
  for (const chore of cfg.chores) {
    if (chore.deployment) validateDescriptor(chore.deployment);
    for (const d of chore.domains || []) if (d.deployment) validateDescriptor(d.deployment);
  }
  return cfg;
}

function validateDescriptor(descriptor: DeploymentDescriptor) {
  const entry = getHandlerEntry(descriptor.type);
  if (entry && entry.validateSchema) {
    // run schema validation here if implemented
  }
}

