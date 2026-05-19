import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const run = async (label, command, args, env = {}) =>
  new Promise((resolvePromise, reject) => {
    console.log(`[preflight] ${label}`);
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) return resolvePromise();
      reject(new Error(`${label} failed with exit code ${code}`));
    });
  });

const bundledWindowsNode = 'C:\\Users\\ians0\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe';
const node = process.platform === 'win32' && existsSync(bundledWindowsNode)
  ? bundledWindowsNode
  : process.execPath;
const viteBin = join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const esbuildBin = join(repoRoot, 'node_modules', 'esbuild', 'bin', 'esbuild');
const tmpRoot = join(repoRoot, 'node_modules', '.cache', '400line-replit-preflight');

const checkRouteInvariants = () => {
  const routesSource = readFileSync(join(repoRoot, 'server', 'routes.ts'), 'utf8');
  assert(routesSource.includes('app.post("/webhook"'), 'LINE webhook route registration moved or missing');
  assert(routesSource.includes('processWebhookEvent(event)'), 'LINE webhook event dispatch moved or missing');
  assert(routesSource.includes('https://smart-schedule-manager.replit.app/api/line/webhook'), 'GPS forward target moved or missing');
  assert(routesSource.includes("app.use('/api/admin', adminDashboardRouter)"), 'admin dashboard router mount missing');
};

const writeSmokeEntry = () => {
  rmSync(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot, { recursive: true });
  const entry = join(tmpRoot, 'internal-monitoring-smoke.ts');
  writeFileSync(entry, `
    import express from 'express';
    import { internalRouter } from '${join(repoRoot, 'server', 'routes', 'internalRoutes.ts').replace(/\\/g, '/')}';

    process.env.NODE_ENV ||= 'production';
    process.env.DATABASE_URL ||= 'postgresql://preflight:preflight@127.0.0.1:5432/preflight';
    process.env.INTERNAL_API_TOKEN ||= 'preflight-internal-token';
    process.env.RAGIC_API_KEY ||= 'preflight-ragic-key';

    const assert = (condition: boolean, message: string) => {
      if (!condition) throw new Error(message);
    };

    const app = express();
    app.use(express.json());
    app.use('/api/internal', internalRouter);

    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('unable to bind preflight server');
    const baseUrl = 'http://127.0.0.1:' + address.port;

    const requestJson = async (path: string, expectedStatus: number) => {
      const response = await fetch(baseUrl + path, {
        headers: { 'x-internal-token': process.env.INTERNAL_API_TOKEN ?? '' },
      });
      const text = await response.text();
      assert(response.status === expectedStatus, path + ' expected ' + expectedStatus + ', got ' + response.status + ': ' + text.slice(0, 200));
      assert(!text.includes(process.env.INTERNAL_API_TOKEN ?? 'preflight-internal-token'), path + ' leaked internal token value');
      assert(!text.includes(process.env.RAGIC_API_KEY ?? 'preflight-ragic-key'), path + ' leaked Ragic token value');
      return text ? JSON.parse(text) : null;
    };

    try {
      const routes = await requestJson('/api/internal/monitoring/routes', 200);
      const dependencies = await requestJson('/api/internal/monitoring/dependencies', 200);
      const missing = await requestJson('/api/internal/monitoring/capabilities/not-found', 404);
      assert(Array.isArray(routes?.monitoringRoutes), 'monitoring routes response missing monitoringRoutes');
      assert(typeof dependencies?.registryCount === 'number', 'dependencies response missing registryCount');
      assert(missing?.message === 'CAPABILITY_NOT_FOUND', 'unknown capability must return CAPABILITY_NOT_FOUND');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  `);
  return entry;
};

await run('client build', node, [viteBin, 'build'], { NODE_ENV: 'production' });
await run('server runtime bundle', node, [
  esbuildBin,
  'server/index.ts',
  '--platform=node',
  '--packages=external',
  '--bundle',
  '--format=esm',
  '--outdir=dist',
], { NODE_ENV: 'production' });

assert(existsSync(join(repoRoot, 'dist', 'index.js')), 'dist/index.js missing after server bundle');
assert(existsSync(join(repoRoot, 'dist', 'public', 'index.html')), 'dist/public/index.html missing after client build');

checkRouteInvariants();

const smokeEntry = writeSmokeEntry();
const smokeOut = join(tmpRoot, 'internal-monitoring-smoke.mjs');
await run('internal monitoring smoke bundle', node, [
  esbuildBin,
  smokeEntry,
  '--platform=node',
  '--packages=external',
  '--bundle',
  '--format=esm',
  `--outfile=${smokeOut}`,
]);
await run('internal monitoring route smoke', node, [smokeOut], {
  NODE_ENV: 'production',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://preflight:preflight@127.0.0.1:5432/preflight',
  INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN || 'preflight-internal-token',
  RAGIC_API_KEY: process.env.RAGIC_API_KEY || 'preflight-ragic-key',
});

console.log('[preflight] Replit deploy preflight passed');
