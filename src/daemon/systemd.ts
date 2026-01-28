import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { DaemonManager, DaemonOptions } from './index';
import { getDataDir, ensureDataDir } from '../utils/paths';

const SERVICE_NAME = 'claude-code-fallback';

function getServicePath(): string {
  return path.join(
    os.homedir(),
    '.config',
    'systemd',
    'user',
    `${SERVICE_NAME}.service`,
  );
}

function generateUnit(options: DaemonOptions): string {
  let execStart: string;

  try {
    const binPath = execSync('which claude-code-fallback', { encoding: 'utf-8' }).trim();
    execStart = `${binPath} serve --port ${options.port}`;
  } catch {
    const cliPath = path.join(__dirname, '..', 'cli.js');
    execStart = `${process.execPath} ${cliPath} serve --port ${options.port}`;
  }

  if (options.configPath) {
    execStart += ` --config ${options.configPath}`;
  }

  return `[Unit]
Description=Claude Code Fallback Proxy
After=network.target

[Service]
Type=simple
ExecStart=${execStart}
Restart=on-failure
RestartSec=5
WorkingDirectory=${getDataDir()}
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;
}

export class SystemdDaemon implements DaemonManager {
  async install(options: DaemonOptions): Promise<void> {
    ensureDataDir();

    const servicePath = getServicePath();
    const serviceDir = path.dirname(servicePath);
    if (!fs.existsSync(serviceDir)) {
      fs.mkdirSync(serviceDir, { recursive: true });
    }

    const unit = generateUnit(options);
    fs.writeFileSync(servicePath, unit, 'utf-8');

    execSync('systemctl --user daemon-reload', { encoding: 'utf-8' });
    execSync(`systemctl --user enable ${SERVICE_NAME}`, { encoding: 'utf-8' });
    execSync(`systemctl --user start ${SERVICE_NAME}`, { encoding: 'utf-8' });
  }

  async uninstall(): Promise<void> {
    try {
      execSync(`systemctl --user stop ${SERVICE_NAME}`, { encoding: 'utf-8' });
    } catch {}
    try {
      execSync(`systemctl --user disable ${SERVICE_NAME}`, { encoding: 'utf-8' });
    } catch {}

    const servicePath = getServicePath();
    if (fs.existsSync(servicePath)) {
      fs.unlinkSync(servicePath);
    }

    try {
      execSync('systemctl --user daemon-reload', { encoding: 'utf-8' });
    } catch {}
  }

  async isRunning(): Promise<boolean> {
    try {
      const output = execSync(
        `systemctl --user is-active ${SERVICE_NAME} 2>/dev/null`,
        { encoding: 'utf-8' },
      );
      return output.trim() === 'active';
    } catch {
      return false;
    }
  }

  async getPid(): Promise<number | null> {
    try {
      const output = execSync(
        `systemctl --user show ${SERVICE_NAME} --property=MainPID 2>/dev/null`,
        { encoding: 'utf-8' },
      );
      const match = output.match(/MainPID=(\d+)/);
      if (match && match[1] !== '0') {
        return parseInt(match[1], 10);
      }
      return null;
    } catch {
      return null;
    }
  }
}
