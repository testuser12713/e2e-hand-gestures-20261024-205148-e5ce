/** Minimal synchronous event emitter used by the controller ('gesture' and 'status'). */
export class Emitter {
  private readonly handlers = new Map<string, Set<Function>>();

  /** Register `h` for `event`. Registering the same handler twice has no extra effect. */
  on(event: string, h: Function): void {
    if (typeof h !== 'function') return;
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(h);
  }

  /** Remove `h` from `event`. Unknown events or handlers are ignored. */
  off(event: string, h: Function): void {
    const set = this.handlers.get(event);
    if (!set) return;
    set.delete(h);
    if (set.size === 0) this.handlers.delete(event);
  }

  /**
   * Call every handler of `event` with `payload`, in registration order. A handler that throws
   * does not stop the others; its error is reported on the console.
   */
  emit(event: string, payload?: unknown): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of Array.from(set)) {
      try {
        (h as (p: unknown) => void)(payload);
      } catch (err) {
        console.error(`[HandGestures] a '${event}' handler failed:`, err);
      }
    }
  }
}
