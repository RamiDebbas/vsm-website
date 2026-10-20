/**
 * Minimal observable store — the only shared mutable state in the app.
 * UI modules and the 3D scene never talk to each other directly; they both read/write here.
 * (see docs/ARCHITECTURE.md → "Data flow")
 */

export type Listener<T> = (next: T, prev: T) => void;

export interface Store<T extends object> {
  get(): T;
  set(patch: Partial<T>): void;
  subscribe(listener: Listener<T>): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();

  return {
    get: () => state,
    set(patch) {
      const prev = state;
      const next = { ...state, ...patch };
      // Skip notification when nothing actually changed (cheap shallow compare).
      const changed = (Object.keys(patch) as (keyof T)[]).some((k) => !Object.is(prev[k], next[k]));
      if (!changed) return;
      state = next;
      for (const l of listeners) l(next, prev);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
