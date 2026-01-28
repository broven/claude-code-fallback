import * as os from 'os';

export interface DaemonOptions {
  port: number;
  configPath?: string;
}

export interface DaemonManager {
  install(options: DaemonOptions): Promise<void>;
  uninstall(): Promise<void>;
  isRunning(): Promise<boolean>;
  getPid(): Promise<number | null>;
}

export function getDaemonManager(): DaemonManager {
  const platform = os.platform();
  if (platform === 'darwin') {
    const { LaunchdDaemon } = require('./launchd');
    return new LaunchdDaemon();
  }
  if (platform === 'linux') {
    const { SystemdDaemon } = require('./systemd');
    return new SystemdDaemon();
  }
  throw new Error(`Daemon management is not supported on ${platform}. Use "claude-code-fallback serve" for foreground mode.`);
}
