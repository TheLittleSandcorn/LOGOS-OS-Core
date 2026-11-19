import { normalize } from 'node:path';

export interface BusMessage {
  origin: string;
  targetBrick: string;
  relativePath?: string;
  callChain: string[];
}

export function validateKernelBusMessage(msg: BusMessage): { allowed: boolean; sanitizedPath?: string } {
  if (msg.origin !== '127.0.0.1' && msg.origin !== 'localhost') {
    throw new Error(`UNTRUSTED_BUS_ORIGIN: '${msg.origin}' rejected (127.0.0.1 Only).`);
  }
  if (msg.callChain.includes(msg.targetBrick)) {
    throw new Error(`CIRCULAR_ROUTE_BLOCKED: Brick '${msg.targetBrick}' already in callChain.`);
  }
  if (msg.relativePath !== undefined) {
    const clean = normalize(msg.relativePath).replaceAll('\\', '/');
    if (clean.startsWith('..') || clean.includes('/../') || clean.startsWith('/')) {
      throw new Error(`PATH_TRAVERSAL_BLOCKED: Unsafe path '${msg.relativePath}'.`);
    }
    return { allowed: true, sanitizedPath: clean };
  }
  return { allowed: true };
}
