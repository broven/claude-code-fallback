import { initIfNeeded } from '../utils/init';
import { getDaemonManager } from '../daemon';

export interface StartOptions {
  port?: string;
  config?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const firstRun = initIfNeeded(options.config);
  if (firstRun) {
    return;
  }

  const daemon = getDaemonManager();
  const isRunning = await daemon.isRunning();

  if (isRunning) {
    const pid = await daemon.getPid();
    console.log(`Daemon is already running (PID: ${pid})`);
    return;
  }

  const port = options.port ? parseInt(options.port, 10) : parseInt(process.env.PORT || '3000', 10);

  await daemon.install({ port, configPath: options.config });
  console.log('Daemon started');
  console.log(`  Proxy URL: http://127.0.0.1:${port}`);

  // Brief wait then verify
  await new Promise((r) => setTimeout(r, 1500));
  const running = await daemon.isRunning();
  if (running) {
    const pid = await daemon.getPid();
    console.log(`  PID: ${pid}`);
    console.log('  Status: running');
  } else {
    console.log('  Status: failed to start — check logs');
  }
}
