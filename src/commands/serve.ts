import { initIfNeeded } from '../utils/init';
import { createServer } from '../server';

export interface ServeOptions {
  port?: string;
  config?: string;
}

export async function serveCommand(options: ServeOptions): Promise<void> {
  const firstRun = initIfNeeded(options.config);
  if (firstRun) {
    return;
  }

  const port = options.port ? parseInt(options.port, 10) : undefined;

  await createServer({
    port,
    configPath: options.config,
  });
}
