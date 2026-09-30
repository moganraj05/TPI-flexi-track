// Runs the backend API and the HR web console together, and restarts
// either one if it stops unexpectedly (waiting a little longer after each
// quick crash). Output goes to the console and to logs/backend.log and
// logs/web.log. This is what `npm start` and the Windows startup task run.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'logs');
const EXIT_WITH_PARENT = path.join(__dirname, 'exit-with-parent.js');
fs.mkdirSync(LOG_DIR, { recursive: true });

const APPS = [
  { name: 'backend', cwd: path.join(ROOT, 'backend'), args: ['src/index.js'], log: 'backend.log' },
  { name: 'web', cwd: ROOT, args: ['deploy/web-server.js'], log: 'web.log' },
];

// A log file is renamed to *.old once it passes this size, so logs can't
// slowly fill the disk on a server nobody is watching.
const MAX_LOG_BYTES = 20 * 1024 * 1024;

let stopping = false;
const children = new Map();

const openLog = (file) => {
  const full = path.join(LOG_DIR, file);
  try {
    if (fs.statSync(full).size > MAX_LOG_BYTES) fs.renameSync(full, `${full}.old`);
  } catch {
    // No log yet.
  }
  return fs.createWriteStream(full, { flags: 'a' });
};

const stamp = () => new Date().toISOString();

function launch(app, attempt = 0) {
  if (stopping) return;
  const log = openLog(app.log);
  const startedAt = Date.now();
  log.write(`\n===== ${stamp()} starting ${app.name} =====\n`);

  // The IPC channel (4th stdio slot) plus the exit-with-parent preload make
  // the child exit whenever this launcher does, however it was stopped.
  const child = spawn(process.execPath, ['-r', EXIT_WITH_PARENT, ...app.args], {
    cwd: app.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  children.set(app.name, child);

  const pipe = (stream, out) =>
    stream.on('data', (chunk) => {
      out.write(chunk);
      log.write(chunk);
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on('exit', (code, signal) => {
    children.delete(app.name);
    log.write(`===== ${stamp()} ${app.name} exited (code ${code}, signal ${signal}) =====\n`);
    log.end();
    if (stopping) return;

    // Ran for a minute or more: treat as a fresh failure. Otherwise back off
    // (2s, 4s, 8s ... max 60s) so a broken config doesn't spin the CPU.
    const next = Date.now() - startedAt > 60000 ? 0 : attempt + 1;
    const delay = Math.min(60000, 2000 * 2 ** Math.max(0, next - 1));
    console.error(`[start-all] ${app.name} stopped; restarting in ${delay / 1000}s`);
    setTimeout(() => launch(app, next), delay);
  });
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('[start-all] stopping...');
  for (const child of children.values()) child.kill();
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

APPS.forEach((app) => launch(app));
console.log(`[start-all] started backend + web. Logs: ${LOG_DIR}`);
