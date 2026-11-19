import dns from 'node:dns';
import net from 'node:net';
import childProcess from 'node:child_process';

const ALLOWED = new Set(['127.0.0.1', 'localhost', '::1']);
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

// 2. Low-Level TCP/Socket Lock (args[0] & args[1] exakt auswerten)
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

// 3. Low-Level Fetch Lock
const origFetch = globalThis.fetch;
const lockedFetch = async (input: any, init?: any) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (!isLocalHost(u.hostname)) {
    throw egressError(`KERNEL_EGRESS_FETCH_BLOCKED:${u.hostname}`);
  }
  return origFetch(input, init);
};
Object.defineProperty(globalThis, 'fetch', { value: lockedFetch, writable: false, configurable: false });

// 4. Hard Child-Process Lock (Blocks curl, wget, python3, shell escapes)
const blockedSpawn = (method: string) => (..._args: any[]) => {
  throw egressError(`KERNEL_EGRESS_CHILD_PROCESS_BLOCKED:${method}`);
};
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) {
  Object.defineProperty(childProcess, method, {
    value: blockedSpawn(method),
    writable: false,
    configurable: false
  });
}

// 5. Child-Process Module Seal
Object.freeze(childProcess);

export const OS_SANDBOX_PROFILE = Object.freeze({
  linuxNamespace: 'unshare -rn -- node --import ./scripts/kernel-egress-lock.ts scripts/sovereign-cockpit-server.ts',
  systemdHardening: ['PrivateNetwork=yes', 'RestrictAddressFamilies=AF_UNIX AF_INET', 'NoNewPrivileges=yes']
});

export const KERNEL_EGRESS_LOCKED = true;
