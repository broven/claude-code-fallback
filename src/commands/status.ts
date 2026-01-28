import { getDaemonManager } from '../daemon';

export async function statusCommand(): Promise<void> {
  const daemon = getDaemonManager();
  const isRunning = await daemon.isRunning();

  if (isRunning) {
    const pid = await daemon.getPid();
    console.log('Status: running');
    console.log(`PID: ${pid}`);
    console.log(`Proxy URL: http://127.0.0.1:${process.env.PORT || '3000'}`);
  } else {
    console.log('Status: stopped');
  }
}
