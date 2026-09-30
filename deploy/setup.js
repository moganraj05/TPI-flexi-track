// One-step server setup, run automatically by `npm install` in the project
// root (and again by `npm run setup` after updating the code):
//   1. checks the Node.js version
//   2. installs backend packages (+ generates the Prisma client)
//   3. installs web console packages and builds it into webfrontend/dist
//   4. applies any pending database migrations, if backend/.env exists
// Stops at the first failing step with a message saying what to fix.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const WEB = path.join(ROOT, 'webfrontend');
const ENV_FILE = path.join(BACKEND, '.env');

const line = () => console.log('-'.repeat(64));
const step = (n, text) => {
  line();
  console.log(`[${n}/4] ${text}`);
  line();
};
const fail = (message) => {
  console.error(`\nSETUP FAILED: ${message}\n`);
  process.exit(1);
};

// npm passes its own lifecycle settings to child processes through npm_config_*
// variables; strip them so the nested installs behave exactly like a plain
// `npm ci` typed in that folder (e.g. `npm install --omit=dev` at the root
// must not drop Vite from the web build).
const cleanEnv = () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase().startsWith('npm_config_')) delete env[key];
  }
  return env;
};

const run = (command, cwd, what) => {
  console.log(`> ${command}   (in ${path.relative(ROOT, cwd) || '.'})\n`);
  const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true, env: cleanEnv() });
  if (result.status !== 0) fail(`${what} did not complete. Read the error above.`);
};

const readEnv = () => {
  const values = {};
  for (const raw of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return values;
};

const serverIps = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

// ---------------------------------------------------------------------------

step(1, 'Checking Node.js');
const major = Number(process.versions.node.split('.')[0]);
console.log(`Node.js ${process.versions.node}`);
if (major < 20) fail('Node.js 20 or newer is required (22 LTS recommended). Install it from https://nodejs.org and reopen the terminal.');

step(2, 'Installing backend packages');
run('npm ci', BACKEND, 'Backend package install');

step(3, 'Installing and building the web console');
run('npm ci --include=dev', WEB, 'Web console package install');
run('npm run build', WEB, 'Web console build');
if (!fs.existsSync(path.join(WEB, 'dist', 'index.html'))) fail('The web console build produced no dist/index.html.');

step(4, 'Updating the database');
if (!fs.existsSync(ENV_FILE)) {
  console.log('backend/.env not found - skipped.');
  console.log('Copy your backend/.env to this folder, then run:  npm run setup');
} else {
  const env = readEnv();
  if (!env.DATABASE_URL) fail('backend/.env has no DATABASE_URL.');
  run('npx prisma migrate deploy', BACKEND, 'Database migration');
}

// ---------------------------------------------------------------------------
line();
console.log('SETUP COMPLETE');
line();

const webPort = process.env.WEB_PORT || '8080';
if (fs.existsSync(ENV_FILE)) {
  const env = readEnv();
  const warnings = [];
  if (env.NODE_ENV !== 'production') warnings.push('NODE_ENV is not "production"');
  if (!env.CORS_ALLOWED_ORIGINS) warnings.push('CORS_ALLOWED_ORIGINS is empty (the website will not be able to sign in)');
  if (warnings.length) {
    console.log('\nCheck backend/.env:');
    warnings.forEach((w) => console.log(`  - ${w}`));
    const ips = serverIps();
    if (ips.length) {
      console.log(`\n  Suggested for this server:`);
      console.log(`    NODE_ENV=production`);
      console.log(`    CORS_ALLOWED_ORIGINS=${ips.map((ip) => `http://${ip}:${webPort}`).join(',')}`);
    }
  }
}

console.log('\nNext:');
console.log('  Test run:            npm start          (Ctrl+C to stop)');
console.log('  Run with Windows:    npm run service:install   (as Administrator)');
console.log('');
