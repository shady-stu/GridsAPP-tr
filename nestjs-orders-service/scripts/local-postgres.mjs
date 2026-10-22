#!/usr/bin/env node
/**
 * Provisions a throwaway PostgreSQL cluster for local development or CI, without Docker.
 *
 * Why this exists: the assignment allows Docker Compose as a *convenience*, and requires a
 * repeatable database setup. On machines where Docker is not running but PostgreSQL binaries
 * are installed (as on the machine this project was built on) this script gives a fully
 * isolated, disposable cluster that never touches an existing PostgreSQL installation:
 * its own data directory, its own port and its own superuser.
 *
 * Usage:
 *   node scripts/local-postgres.mjs init     # create the cluster + roles + databases
 *   node scripts/local-postgres.mjs start
 *   node scripts/local-postgres.mjs stop
 *   node scripts/local-postgres.mjs status
 *   node scripts/local-postgres.mjs destroy  # stop and delete the cluster directory
 *
 * Configuration (environment variables):
 *   PG_BIN       directory containing initdb/pg_ctl/psql  (auto-detected when omitted)
 *   PGPORT       port for the local cluster               (default 55432)
 *   PG_SUPERUSER superuser name                           (default orders)
 *   PG_PASSWORD  superuser password                       (default orders)
 *   PG_DATA_DIR  data directory                           (default <repo>/.local-postgres/data)
 */
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PGPORT ?? '55432';
const SUPERUSER = process.env.PG_SUPERUSER ?? 'orders';
const PASSWORD = process.env.PG_PASSWORD ?? 'orders';
const DATA_DIR = process.env.PG_DATA_DIR ?? join(repoRoot, '.local-postgres', 'data');
const LOG_FILE = join(dirname(DATA_DIR), 'postgres.log');
const DATABASES = ['orders_dev', 'orders_test'];

function log(message) {
  process.stdout.write(`[local-postgres] ${message}\n`);
}

function fail(message, result) {
  if (result?.stderr) process.stderr.write(String(result.stderr));
  if (result?.stdout) process.stderr.write(String(result.stdout));
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: PASSWORD },
    ...options,
  });
  if (options.allowFailure) return result;
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`Command failed: ${command} ${args.join(' ')}`, result);
  return result;
}

/** Locate a PostgreSQL bin directory containing the binaries we need. */
function resolvePgBin() {
  if (process.env.PG_BIN) {
    if (!existsSync(join(process.env.PG_BIN, binary('initdb')))) {
      throw new Error(`PG_BIN=${process.env.PG_BIN} does not contain initdb`);
    }
    return process.env.PG_BIN;
  }

  const candidates = [];
  if (process.platform === 'win32') {
    for (const major of ['18', '17', '16', '15', '14']) {
      candidates.push(`C:\\Program Files\\PostgreSQL\\${major}\\bin`);
    }
  } else {
    candidates.push('/usr/lib/postgresql/18/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin', '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin');
  }

  for (const candidate of candidates) {
    if (existsSync(join(candidate, binary('initdb')))) return candidate;
  }
  throw new Error('Could not find PostgreSQL binaries. Set PG_BIN to the directory containing initdb.');
}

function binary(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function pg(bin, name, args) {
  return run(join(bin, binary(name)), args);
}

function isRunning(bin) {
  // `pg_ctl status` exits with 3 when no server is running, so failure is expected here.
  const result = run(join(bin, binary('pg_ctl')), ['status', '-D', DATA_DIR], { allowFailure: true });
  return result.status === 0;
}

function init() {
  const bin = resolvePgBin();
  if (existsSync(join(DATA_DIR, 'PG_VERSION'))) {
    log(`cluster already initialised at ${DATA_DIR}`);
  } else {
    mkdirSync(dirname(DATA_DIR), { recursive: true });
    const passwordFile = join(dirname(DATA_DIR), 'pwfile');
    writeFileSync(passwordFile, `${PASSWORD}\n`, 'utf8');
    log(`initialising cluster at ${DATA_DIR}`);
    pg(bin, 'initdb', [
      '-D',
      DATA_DIR,
      '-U',
      SUPERUSER,
      '--auth-local=scram-sha-256',
      '--auth-host=scram-sha-256',
      `--pwfile=${passwordFile}`,
      '--encoding=UTF8',
      '--locale=C',
    ]);
    rmSync(passwordFile, { force: true });
  }

  start(bin);
  createDatabases(bin);
}

/**
 * `pg_ctl start` is deliberately **not** used here.
 *
 * On Windows, `pg_ctl` launches the postmaster with inherited handles, and a synchronous
 * `spawnSync` then blocks until those handles close — which never happens, because the
 * postmaster outlives the command. Even `stdio: 'ignore'` does not fully avoid this.
 *
 * Instead we start `postgres` directly as a detached, unref'ed process with its stdio
 * redirected to a log file, then poll the cluster until it accepts connections. Shutdown still
 * goes through `pg_ctl stop`, which locates the server through `postmaster.pid` regardless of
 * how it was started.
 */
function start(binArg) {
  const bin = binArg ?? resolvePgBin();
  if (isRunning(bin)) {
    log('cluster is already running');
    return;
  }

  log(`starting cluster on 127.0.0.1:${PORT}`);
  // Append so restarts keep their history; the parent closes its copy immediately and the
  // detached postmaster keeps writing to its own descriptor.
  const logDescriptor = openSync(LOG_FILE, 'a');
  try {
    const child = spawn(
      join(bin, binary('postgres')),
      ['-D', DATA_DIR, '-p', PORT, '-c', 'listen_addresses=127.0.0.1', '-c', 'fsync=off'],
      {
        detached: true,
        stdio: ['ignore', logDescriptor, logDescriptor],
        windowsHide: true,
      },
    );
    child.unref();
  } finally {
    closeSync(logDescriptor);
  }

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (isRunning(bin)) return;
    sleepSync(250);
  }
  throw new Error(`cluster did not start within 60s; see ${LOG_FILE}`);
}

/** Blocking sleep without a busy loop (`Atomics.wait` on a throwaway buffer). */
function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function createDatabases(bin) {
  for (const database of DATABASES) {
    const exists = run(
      join(bin, binary('psql')),
      ['-h', '127.0.0.1', '-p', PORT, '-U', SUPERUSER, '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${database}'`],
      { allowFailure: true },
    );
    if (exists.status === 0 && String(exists.stdout).trim() === '1') {
      log(`database ${database} already exists`);
      continue;
    }
    log(`creating database ${database}`);
    pg(bin, 'psql', ['-h', '127.0.0.1', '-p', PORT, '-U', SUPERUSER, '-d', 'postgres', '-c', `CREATE DATABASE "${database}"`]);
  }
}

function stop(binArg) {
  const bin = binArg ?? resolvePgBin();
  if (!existsSync(join(DATA_DIR, 'PG_VERSION'))) {
    log('no cluster found; nothing to stop');
    return;
  }
  if (!isRunning(bin)) {
    log('cluster is not running');
    return;
  }
  log('stopping cluster');
  pg(bin, 'pg_ctl', ['stop', '-D', DATA_DIR, '-m', 'fast', '-w', '-t', '60']);
}

function status() {
  const bin = resolvePgBin();
  const running = isRunning(bin);
  log(`data directory : ${DATA_DIR}`);
  log(`port           : ${PORT}`);
  log(`superuser      : ${SUPERUSER}`);
  log(`running        : ${running ? 'yes' : 'no'}`);
  if (running) {
    log(`dev URL        : postgresql://${SUPERUSER}:${PASSWORD}@127.0.0.1:${PORT}/orders_dev`);
    log(`test URL       : postgresql://${SUPERUSER}:${PASSWORD}@127.0.0.1:${PORT}/orders_test`);
  }
  if (existsSync(LOG_FILE)) {
    const tail = readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-5).join('\n');
    log(`last log lines :\n${tail}`);
  }
}

function destroy() {
  try {
    stop();
  } catch {
    // The cluster may already be down; deletion is what matters here.
  }
  rmSync(dirname(DATA_DIR), { recursive: true, force: true });
  log(`removed ${dirname(DATA_DIR)}`);
}

const command = process.argv[2] ?? 'status';
try {
  switch (command) {
    case 'init':
      init();
      status();
      break;
    case 'start':
      start();
      status();
      break;
    case 'stop':
      stop();
      break;
    case 'status':
      status();
      break;
    case 'destroy':
      destroy();
      break;
    default:
      throw new Error(`Unknown command "${command}". Use init | start | stop | status | destroy.`);
  }
} catch (error) {
  process.stderr.write(`[local-postgres] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
