import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundledWindowsNode = 'C:\\Users\\ians0\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe';
const node = process.platform === 'win32' && existsSync(bundledWindowsNode)
  ? bundledWindowsNode
  : process.execPath;
const tscBin = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

const child = spawn(node, [tscBin, '--pretty', 'false', '--noEmit'], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false,
});

child.on('error', (error) => {
  console.error('[typecheck] failed to start TypeScript:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
