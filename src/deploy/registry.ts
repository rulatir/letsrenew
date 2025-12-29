import { DeploymentDescriptor } from '../models/types';

export interface Handler {
  validateParams(params: Record<string, unknown> | undefined): void;
  deploy(chore: any, domain: any, challenge: any): Promise<void>;
  cleanup(chore: any, domain: any, challenge: any): Promise<void>;
}

type RegistryEntry = {
  validateSchema?: unknown;
  factory: (params: Record<string, unknown> | undefined) => Handler;
};

const registry = new Map<string, RegistryEntry>();

export function registerHandler(id: string, entry: RegistryEntry) {
  registry.set(id, entry);
}

export function getHandlerEntry(id: string) {
  return registry.get(id);
}

export function resolveHandler(descriptor: DeploymentDescriptor): Handler {
  const entry = registry.get(descriptor.type);
  if (!entry) throw new Error(`Unknown deployment handler type: ${descriptor.type}`);
  return entry.factory(descriptor.params);
}

