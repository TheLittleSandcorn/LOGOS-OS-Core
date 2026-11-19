export class EGraphEquivalenceEngine {
  private readonly parent = new Map<string, string>();

  private canonicalize(expr: string): string {
    let s = expr.replace(/\s+/g, '');
    if (s.startsWith('1*(') && s.endsWith(')')) s = s.slice(3, -1);
    if (s.startsWith('1*')) s = s.slice(2);
    if (s.endsWith('+0')) s = s.slice(0, -2);
    if (s.startsWith('0+')) s = s.slice(2);
    return s;
  }

  find(term: string): string {
    const c = this.canonicalize(term);
    if (!this.parent.has(c)) {
      this.parent.set(c, c);
      return c;
    }
    let root = c;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let curr = c;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(lhs: string, rhs: string): { root: string } {
    const rA = this.find(lhs);
    const rB = this.find(rhs);
    if (rA !== rB) {
      const [canon, child] = rA.length <= rB.length ? [rA, rB] : [rB, rA];
      this.parent.set(child, canon);
      return { root: canon };
    }
    return { root: rA };
  }

  areEquivalent(lhs: string, rhs: string): boolean {
    return this.find(lhs) === this.find(rhs);
  }
}
