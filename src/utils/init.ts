import { existsSync, copyFileSync } from 'fs';
import * as path from 'path';
import { getConfigPath, getDataDir, ensureDataDir } from './paths';

/**
 * First-run initialization.
 * If no config file exists, copies providers.yaml.example into ~/.claude-code-fallback/
 * and prints a welcome message.
 *
 * Returns true if this was a first run (config was just created).
 */
export function initIfNeeded(configPath?: string): boolean {
  const resolvedConfig = getConfigPath(configPath);

  if (existsSync(resolvedConfig)) {
    return false;
  }

  ensureDataDir();

  // Find the example file bundled with the package
  const examplePaths = [
    path.join(__dirname, '..', '..', 'providers.yaml.example'),
    path.join(__dirname, '..', 'providers.yaml.example'),
    path.join(process.cwd(), 'providers.yaml.example'),
  ];

  let examplePath: string | null = null;
  for (const p of examplePaths) {
    if (existsSync(p)) {
      examplePath = p;
      break;
    }
  }

  if (examplePath) {
    copyFileSync(examplePath, resolvedConfig);
    console.log(`Created config at: ${resolvedConfig}`);
  } else {
    // Write a minimal config
    const fs = require('fs');
    const minimalConfig = `# Claude Code Fallback Proxy Configuration
debug: false

providers: []
#  - name: "my-provider"
#    baseUrl: "https://api.example.com/v1/messages"
#    apiKey: "YOUR_API_KEY_HERE"
#    authHeader: "Authorization"
#    modelMapping:
#      claude-sonnet-4-20250514: "anthropic/claude-sonnet-4"
`;
    fs.writeFileSync(resolvedConfig, minimalConfig, 'utf-8');
    console.log(`Created config at: ${resolvedConfig}`);
  }

  console.log('');
  console.log('Welcome to Claude Code Fallback Proxy!');
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit your config: ${resolvedConfig}`);
  console.log('  2. Add at least one fallback provider');
  console.log('  3. Run again: claude-code-fallback');
  console.log('');

  return true;
}
