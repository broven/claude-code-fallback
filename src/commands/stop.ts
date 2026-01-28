import { getDaemonManager } from '../daemon';

export async function stopCommand(): Promise<void> {
  const daemon = getDaemonManager();
  const isRunning = await daemon.isRunning();

  if (!isRunning) {
    console.log('Daemon is not running');
    return;
  }

  await daemon.uninstall();
  console.log('Daemon stopped');
}
