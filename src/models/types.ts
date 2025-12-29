export interface DeploymentDescriptor {
  type: string;
  params?: Record<string, unknown>;
}

export interface DomainSpec {
  name: string;
  deployment?: DeploymentDescriptor;
}

export interface Chore {
  id: string;
  name: string;
  description?: string;
  domains: DomainSpec[];
  docroot: string;
  deployment?: DeploymentDescriptor;
  certPath?: string;
  enabled: boolean;
  notifyOnFailure?: string[];
  preferredAcmeAccount?: string;
  challengeType?: string;
}

export interface Config {
  version: number;
  intervalMinutes: number;
  expiryThresholdDays: number;
  statusPort: number;
  statusDigestUser?: string;
  statusDigestPasswordHash?: string;
  certStorageDir: string;
  acme: {
    directoryUrl: string;
    clientMode?: string;
  };
  ssh?: {
    knownHostsPath?: string;
  };
  logging?: {
    level?: string;
    json?: boolean;
  };
  chores: Chore[];
}

