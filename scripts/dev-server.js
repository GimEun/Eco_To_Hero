import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const root = dirname(dirname(script));
const runtime = join(root, '.dev-server');
const ownerFile = join(runtime, 'owner.json');
const stopFile = join(runtime, 'stop');
const logFile = join(runtime, 'server.log');
const command = process.argv[2] ?? 'start';
mkdirSync(runtime, { recursive: true });

function owner() {
  try { return JSON.parse(readFileSync(ownerFile, 'utf8')); } catch { return null; }
}
function running() {
  const info = owner();
  if (!Number.isSafeInteger(info?.pid) || info.pid < 1) return false;
  try { process.kill(info.pid, 0); return true; } catch { return false; }
}
function remove(path) { try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

if (command === 'start') {
  if (running()) {
    console.log('Development server supervisor is already running: http://127.0.0.1:5173/');
  } else {
    remove(ownerFile); remove(stopFile);
    const log = openSync(logFile, 'a');
    const supervisor = spawn(process.execPath, [script, 'watch'], {
      cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log],
    });
    supervisor.on('error', error => { console.error(error.message); process.exitCode = 1; });
    supervisor.unref(); closeSync(log);
    for (let i = 0; i < 30 && !running(); i++) await delay(100);
    if (!running()) throw new Error(`Server supervisor did not start. Check ${logFile}`);
    console.log('Background server started: http://127.0.0.1:5173/');
    console.log('Unexpected exits restart automatically. Stop with npm.cmd run dev:stop');
  }
} else if (command === 'stop') {
  if (running()) {
    writeFileSync(stopFile, 'stop', 'utf8');
    for (let i = 0; i < 50 && running(); i++) await delay(100);
    if (running()) throw new Error(`Server is still stopping. Check ${logFile}`);
  }
  console.log('Background server stopped.');
} else if (command === 'watch') {
  // Exclusive owner file prevents simultaneous launches from creating duplicate supervisors.
  let lock;
  try { lock = openSync(ownerFile, 'wx'); } catch (error) {
    if (error.code === 'EEXIST') process.exit(0);
    throw error;
  }
  const publish = childPid => writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, childPid }), 'utf8');
  writeFileSync(lock, JSON.stringify({ pid: process.pid, childPid: null })); closeSync(lock);
  let child = null, stopping = false, restart = null;
  const finish = () => {
    clearInterval(poll); clearTimeout(restart);
    if (owner()?.pid === process.pid) { remove(ownerFile); remove(stopFile); }
    process.exit(0);
  };
  const stop = () => {
    stopping = true; clearTimeout(restart);
    if (child) child.kill(); else finish();
  };
  const launch = () => {
    if (stopping) return;
    console.log(`[${new Date().toISOString()}] Starting Vite`);
    child = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'],
    });
    publish(child.pid ?? null);
    child.on('error', error => console.error(error.message));
    child.on('close', code => {
      child = null; publish(null);
      if (stopping) return finish();
      console.log(`[${new Date().toISOString()}] Vite exited (${code}); restarting in 2 seconds`);
      restart = setTimeout(launch, 2000);
    });
  };
  const poll = setInterval(() => { if (existsSync(stopFile) && !stopping) stop(); }, 300);
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  launch();
} else {
  throw new Error('Use start, stop, or watch.');
}
