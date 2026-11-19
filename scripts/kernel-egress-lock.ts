import dns from 'node:dns';
import net from 'node:net';

const ALLOWED = new Set(['127.0.0.1', 'localhost', '::1']);
const isLocalHost = (h: string) => ALLOWED.has(String(h || '').toLowerCase());

const origLookup = dns.lookup.bind(dns);
(dns as any).lookup = (host: string, opts: any, cb?: any) => {
  const fn = typeof opts === 'function' ? opts : cb;
  if (!isLocalHost(host)) return fn(Object.assign(new Error(`KERNEL_EGRESS_DNS_BLOCKED:${host}`), { code: 'EGRESS_FIREWALL_BLOCKED' }));
  return typeof opts === 'function' ? origLookup(host, opts) : origLookup(host, opts, cb);
};

const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args: any[]) {
  const first = args;
  if (typeof first === 'string' || (typeof first === 'object' && first !== null && 'path' in first && !('host' in first))) {
    return origConnect.apply(this, args as any);
  }
  const host = typeof first === 'object' && first !== null
    ? (first.host || first.hostname || '127.0.0.1')
    : (typeof args === 'string' ? args : '127.0.0.1');
  if (!isLocalHost(host)) throw Object.assign(new Error(`KERNEL_EGRESS_NET_BLOCKED:${host}`), { code: 'EGRESS_FIREWALL_BLOCKED' });
  return origConnect.apply(this, args as any);
};

const origFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (!isLocalHost(u.hostname)) throw Object.assign(new Error(`KERNEL_EGRESS_FETCH_BLOCKED:${u.hostname}`), { code: 'EGRESS_FIREWALL_BLOCKED' });
  return origFetch(input, init);
};

export const KERNEL_EGRESS_LOCKED = true;
