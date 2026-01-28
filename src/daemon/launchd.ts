import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { DaemonManager, DaemonOptions } from './index';
import { getDataDir, ensureDataDir } from '../utils/paths';

const LABEL = 'com.github.broven.claude-code-fallback';

function getPlistPath(): string {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
}

function findBinaryPath(): string {
  try {
    return execSync('which claude-code-fallback', { encoding: 'utf-8' }).trim();
  } catch {
    // Fallback: use node + the CLI script
    const cliPath = path.join(__dirname, '..', 'cli.js');
    if (fs.existsSync(cliPath)) {
      return process.execPath;
    }
    throw new Error('Cannot find claude-code-fallback binary. Is it installed globally?');
  }
}

function generatePlist(options: DaemonOptions): string {
  const dataDir = getDataDir();
  let binPath: string;
  let args: string[];

  try {
    binPath = execSync('which claude-code-fallback', { encoding: 'utf-8' }).trim();
    args = [binPath, 'serve', '--port', String(options.port)];
  } catch {
    // Use node directly
    binPath = process.execPath;
    const cliPath = path.join(__dirname, '..', 'cli.js');
    args = [binPath, cliPath, 'serve', '--port', String(options.port)];
  }

  if (options.configPath) {
    args.push('--config', options.configPath);
  }

  const programArgs = args.map((a) => `    <string>${a}</string>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(dataDir, 'daemon-stdout.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(dataDir, 'daemon-stderr.log')}</string>
  <key>WorkingDirectory</key>
  <string>${dataDir}</string>
</dict>
</plist>`;
}

export class LaunchdDaemon implements DaemonManager {
  async install(options: DaemonOptions): Promise<void> {
    ensureDataDir();

    // Ensure LaunchAgents dir exists
    const agentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }

    const plistPath = getPlistPath();
    const plist = generatePlist(options);
    fs.writeFileSync(plistPath, plist, 'utf-8');

    // Unload first if already loaded (ignore errors)
    try {
      execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { encoding: 'utf-8' });
    } catch {}

    execSync(`launchctl load "${plistPath}"`, { encoding: 'utf-8' });
  }

  async uninstall(): Promise<void> {
    const plistPath = getPlistPath();
    if (!fs.existsSync(plistPath)) {
      return;
    }

    try {
      execSync(`launchctl unload "${plistPath}"`, { encoding: 'utf-8' });
    } catch {}

    fs.unlinkSync(plistPath);
  }

  async isRunning(): Promise<boolean> {
    try {
      const output = execSync(`launchctl list "${LABEL}" 2>/dev/null`, {
        encoding: 'utf-8',
      });
      // If the command succeeds, the service is loaded
      // Check if PID is present (not '-' or '0')
      const lines = output.trim().split('\n');
      // launchctl list <label> outputs: { "PID" = ...; ... }
      // or a table-like output depending on macOS version
      return !output.includes('"PID" = 0') && output.includes('PID');
    } catch {
      return false;
    }
  }

  async getPid(): Promise<number | null> {
    try {
      const output = execSync(`launchctl list "${LABEL}" 2>/dev/null`, {
        encoding: 'utf-8',
      });
      const match = output.match(/"PID"\s*=\s*(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return null;
    } catch {
      return null;
    }
  }
}
