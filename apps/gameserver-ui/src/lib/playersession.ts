export class SessionTracker {
  private firstSeen = new Map<string, number>();
  constructor(private now: () => number = () => Date.now()) {}
  seen(ids: string[]): void {
    const set = new Set(ids);
    for (const id of [...this.firstSeen.keys()]) if (!set.has(id)) this.firstSeen.delete(id);
    for (const id of ids) if (!this.firstSeen.has(id)) this.firstSeen.set(id, this.now());
  }
  since(id: string): number | null {
    return this.firstSeen.get(id) ?? null;
  }
}
