import { pathToFileURL } from 'node:url';
﻿import dns from 'node:dns';
import net from 'node:net';
import dgram from 'node:dgram';
import tls from 'node:tls';
import http2 from 'node:http2';
import childProcess from 'node:child_process';
import workerThreads from 'node:worker_threads';
import path from 'node:path';

const ALLOWED = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const isLocalHost = (h: string) => ALLOWED.has(String(h || '').toLowerCase());

function egressError(msg: string) {
  return Object.assign(new Error(msg), { code: 'EGRESS_FIREWALL_BLOCKED' });
}

// 1. Low-Level DNS Lock
const origLookup = dns.lookup.bind(dns);
const lockedLookup = (host: string, opts: any, cb?: any) => {
  const fn = typeof opts === 'function' ? opts : cb;
  if (!isLocalHost(host)) {
    const err = egressError(`KERNEL_EGRESS_DNS_BLOCKED:${host}`);
    if (typeof fn === 'function') return fn(err);
    throw err;
  }
  return typeof opts === 'function' ? origLookup(host, opts) : origLookup(host, opts, cb);
};
Object.defineProperty(dns, 'lookup', { value: lockedLookup, writable: false, configurable: false });

// 2. Low-Level TCP/Socket Lock
const origConnect = net.Socket.prototype.connect;
const lockedConnect = function (this: net.Socket, ...args: any[]) {
  const first = args[0];
  if (typeof first === 'string' || (typeof first === 'object' && first !== null && 'path' in first && !('host' in first))) {
    return origConnect.apply(this, args as any);
  }
  const host = typeof first === 'object' && first !== null
    ? (first.host || first.hostname || '127.0.0.1')
    : (typeof args[1] === 'string' ? args[1] : '127.0.0.1');
  if (!isLocalHost(host)) {
    throw egressError(`KERNEL_EGRESS_NET_BLOCKED:${host}`);
  }
  return origConnect.apply(this, args as any);
};
Object.defineProperty(net.Socket.prototype, 'connect', { value: lockedConnect, writable: false, configurable: false });

// 3. Low-Level TLS & HTTP2 Lock (blocks IP-literal bypasses)
const origTlsConnect = tls.connect.bind(tls);
const lockedTlsConnect = (...args: any[]) => {
  const first = args[0];
  const host = typeof first === 'object' && first !== null ? (first.host || first.servername || '') : (typeof args[1] === 'string' ? args[1] : '');
  if (!isLocalHost(host)) throw egressError(`KERNEL_EGRESS_TLS_BLOCKED:${host}`);
  return (origTlsConnect as any)(...args);
};
Object.defineProperty(tls, 'connect', { value: lockedTlsConnect, writable: false, configurable: false });

const origHttp2Connect = http2.connect.bind(http2);
const lockedHttp2Connect = (authority: string | URL, ...rest: any[]) => {
  const u = new URL(typeof authority === 'string' ? authority : authority.href);
  if (!isLocalHost(u.hostname)) throw egressError(`KERNEL_EGRESS_HTTP2_BLOCKED:${u.hostname}`);
  return (origHttp2Connect as any)(authority, ...rest);
};
Object.defineProperty(http2, 'connect', { value: lockedHttp2Connect, writable: false, configurable: false });

// 4. Hard UDP/dgram Lock
const blockedDgram = () => {
  throw egressError('KERNEL_EGRESS_DGRAM_UDP_BLOCKED');
};
Object.defineProperty(dgram, 'createSocket', { value: blockedDgram, writable: false, configurable: false });
Object.freeze(dgram);

// 5. Low-Level Fetch Lock
const origFetch = globalThis.fetch;
const lockedFetch = async (input: any, init?: any) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (!isLocalHost(u.hostname)) {
    throw egressError(`KERNEL_EGRESS_FETCH_BLOCKED:${u.hostname}`);
  }
  return origFetch(input, init);
};
Object.defineProperty(globalThis, 'fetch', { value: lockedFetch, writable: false, configurable: false });

// 6. Hard Child-Process Lock
const blockedSpawn = (method: string) => (..._args: any[]) => {
  throw egressError(`KERNEL_EGRESS_CHILD_PROCESS_BLOCKED:${method}`);
};
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) {
  Object.defineProperty(childProcess, method, { value: blockedSpawn(method), writable: false, configurable: false });
}
Object.freeze(childProcess);

// 7. Worker-Threads Pre-Import Inheritance Guard
const OrigWorker = workerThreads.Worker;
const LOCK_PATH = pathToFileURL(path.resolve(process.cwd(), 'scripts/kernel-egress-lock.ts')).href;
class LockedWorker extends OrigWorker {
  constructor(filename: string | URL, options: any = {}) {
    const baseArgs = Array.isArray(options.execArgv) ? options.execArgv : process.execArgv;
    const enforcedArgs = baseArgs.includes(LOCK_PATH) ? baseArgs : ['--import', LOCK_PATH, ...baseArgs];
    super(filename, { ...options, execArgv: enforcedArgs });
  }
}
Object.defineProperty(workerThreads, 'Worker', { value: LockedWorker, writable: false, configurable: false });

// 8. Native Addon dlopen Guard (blocks external .node addons)
const origDlopen = process.dlopen.bind(process);
Object.defineProperty(process, 'dlopen', {
  value: (mod: any, filename: string, flags?: number) => {
    const resolved = path.resolve(filename);
    if (resolved.startsWith(process.cwd())) {
      throw egressError(`KERNEL_EGRESS_NATIVE_ADDON_BLOCKED:${path.basename(resolved)}`);
    }
    return origDlopen(mod, filename, flags);
  },
  writable: false,
  configurable: false
});

export const OS_SANDBOX_PROFILE = Object.freeze({
  linuxNamespace: 'unshare -rn -- node --import ./scripts/kernel-egress-lock.ts scripts/sovereign-cockpit-server.ts',
  systemdHardening: ['PrivateNetwork=yes', 'RestrictAddressFamilies=AF_UNIX AF_INET', 'NoNewPrivileges=yes']
});

export const KERNEL_EGRESS_LOCKED = true;
