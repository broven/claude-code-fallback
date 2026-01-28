#!/usr/bin/env node

import { Command } from 'commander';
import { serveCommand } from './commands/serve';
import { startCommand } from './commands/start';
import { stopCommand } from './commands/stop';
import { statusCommand } from './commands/status';
import { setupCommand } from './commands/setup';

const pkg = require('../package.json');

const program = new Command();

program
  .name('claude-code-fallback')
  .description('Fallback proxy for Claude Code — routes to alternative providers when Anthropic API is unavailable')
  .version(pkg.version);

program
  .command('serve', { isDefault: true })
  .description('Start the proxy server in the foreground')
  .option('-p, --port <port>', 'Port to listen on (default: 3000)')
  .option('-c, --config <path>', 'Path to providers.yaml config file')
  .action(serveCommand);

program
  .command('start')
  .description('Start the proxy as a background daemon')
  .option('-p, --port <port>', 'Port to listen on (default: 3000)')
  .option('-c, --config <path>', 'Path to providers.yaml config file')
  .action(startCommand);

program
  .command('stop')
  .description('Stop the background daemon')
  .action(stopCommand);

program
  .command('status')
  .description('Show daemon status')
  .action(statusCommand);

program
  .command('setup')
  .description('Configure shell environment variables for Claude Code')
  .action(setupCommand);

program.parse();
