import * as path from 'path';
import * as os from 'os';
import { mkdirSync, existsSync } from 'fs';

const DATA_DIR_NAME = '.claude-code-fallback';

export function getDataDir(): string {
  return path.join(os.homedir(), DATA_DIR_NAME);
}

export function getConfigPath(customPath?: string): string {
  if (customPath) return path.resolve(customPath);
  if (process.env.CLAUDE_CODE_FALLBACK_CONFIG) {
    return path.resolve(process.env.CLAUDE_CODE_FALLBACK_CONFIG);
  }
  return path.join(getDataDir(), 'providers.yaml');
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'logs.db');
}

export function getLogPath(): string {
  return path.join(getDataDir(), 'debug.log');
}

export function getPidPath(): string {
  return path.join(getDataDir(), 'daemon.pid');
}

export function ensureDataDir(): void {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
