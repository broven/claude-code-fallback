import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const MARKER = '# Claude Code Fallback Proxy';

function getPort(): string {
  return process.env.PORT || '3000';
}

function getBlock(): string {
  return `
${MARKER}
export ANTHROPIC_BASE_URL="http://127.0.0.1:${getPort()}"
`;
}

function getShellProfile(): string {
  const shell = process.env.SHELL || '';
  if (shell.endsWith('/zsh')) {
    return path.join(os.homedir(), '.zshrc');
  }
  return path.join(os.homedir(), '.bashrc');
}

export function setupCommand(): void {
  const profilePath = getShellProfile();
  const profileName = path.basename(profilePath);

  // Check if already configured
  if (fs.existsSync(profilePath)) {
    const content = fs.readFileSync(profilePath, 'utf-8');
    if (content.includes(MARKER)) {
      console.log(`Already configured in ~/${profileName}`);
      console.log('');
      console.log('Current configuration:');
      const start = content.indexOf(MARKER);
      const end = content.indexOf('\n\n', start);
      const block = content.slice(start, end > start ? end : undefined);
      console.log(block);
      return;
    }
  }

  fs.appendFileSync(profilePath, getBlock());

  console.log(`Added environment variables to ~/${profileName}:`);
  console.log('');
  console.log(`  ANTHROPIC_BASE_URL="http://127.0.0.1:${getPort()}"`);
  console.log('');
  console.log(`Reload your shell or run: source ~/${profileName}`);
}
