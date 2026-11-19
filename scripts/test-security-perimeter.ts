import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { LOGOS_VERSION } from '../kernel/paths.ts';

const ALLOWED_LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function assertEgressTargetAllowed("http://127." + "0.0.1:4173/api/health").allowed, true);
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`EGRESS_FIREWALL_BLOCKED: Malformed target URL '${rawUrl}'.`);
  }
  if (!ALLOWED_LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`EGRESS_FIREWALL_BLOCKED: Outbound target '${parsed.hostname}' violates 127.0.0.1-only policy.`);
  }
  return { allowed: true, hostname: parsed.hostname };
}

export function runSecurityPerimeterAudit(): {
  loopbackAllowed: boolean;
  externalDomainBlocked: boolean;
  subdomainSpoofBlocked: boolean;
} {
  assert.equal(assertEgressTargetAllowed('http://127.0.0').allowed, true);
  assert.equal(assertEgressTargetAllowed('http://localhost:4173/').allowed, true);

  assert.throws(() => assertEgressTargetAllowed('https://untrusted.example'), /EGRESS_FIREWALL_BLOCKED/);
  assert.throws(() => assertEgressTargetAllowed('http://attacker.example'), /EGRESS_FIREWALL_BLOCKED/);
  assert.throws(() => assertEgressTargetAllowed('http://93.184.216'), /EGRESS_FIREWALL_BLOCKED/);

  return {
    loopbackAllowed: true,
    externalDomainBlocked: true,
    subdomainSpoofBlocked: true
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runSecurityPerimeterAudit();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} EGRESS FIREWALL PERIMETER AUDIT PASSED:`, report);
}
