import { existsSync } from 'node:fs';

export const MODE_STRICT_PROOF = 1;
export const MODE_EXPLORE_SANDBOX = 2;

export const POLICY_READ = 0b0001;
export const POLICY_WRITE_CLASS_A = 0b0010;
export const POLICY_EXPORT_BUNDLE = 0b0100;

export class ZeroPageKernelRegister {
  private readonly view: Int32Array;
  private readonly haltFlagPath: string;

  constructor(haltFlagPath = 'dist/.LOGOS_HALT') {
    this.view = new Int32Array(new SharedArrayBuffer(64));
    this.haltFlagPath = haltFlagPath;
    Atomics.store(this.view, 0, MODE_STRICT_PROOF);
    Atomics.store(this.view, 1, POLICY_READ | POLICY_WRITE_CLASS_A | POLICY_EXPORT_BUNDLE);
  }

  assertNotHalted(): void {
    if (existsSync(this.haltFlagPath)) {
      throw new Error(`KERNEL_HALT_ACTIVE: Kill-switch '${this.haltFlagPath}' is engaged.`);
    }
  }

  getMode(): number {
    return Atomics.load(this.view, 0);
  }

  switchMode(mode: typeof MODE_STRICT_PROOF | typeof MODE_EXPLORE_SANDBOX): void {
    this.assertNotHalted();
    Atomics.store(this.view, 0, mode);
  }

  hasPolicy(mask: number): boolean {
    const activeMask = Atomics.load(this.view, 1);
    if (this.getMode() === MODE_EXPLORE_SANDBOX && (mask & POLICY_WRITE_CLASS_A) !== 0) {
      return false;
    }
    return (activeMask & mask) === mask;
  }
}
