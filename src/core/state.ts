import type { DivisionId } from '../config/site.ts';
import { createStore } from './store.ts';

export type SectionId = 'top' | 'group' | 'divisions' | 'contact';

export interface AppState {
  /** Division the visitor selected (click, keyboard, deep link). Drives accent colour + scene focus. */
  active: DivisionId | null;
  /** Division under the pointer / keyboard focus — a lighter-weight preview than `active`. */
  preview: DivisionId | null;
  /** Section currently crossing the viewport's midline; the scene uses it to choose a camera pose. */
  section: SectionId;
  /** User asked the OS for reduced motion. */
  reducedMotion: boolean;
  /** Visitor pressed the on-page "Pause motion" toggle (WCAG 2.2.2). Persisted per browser. */
  motionPaused: boolean;
  /** Timestamp (ms) of the last deliberate user interaction; used by the idle tour policy. */
  lastInteraction: number;
}

export const store = createStore<AppState>({
  active: null,
  preview: null,
  section: 'top',
  reducedMotion: false,
  motionPaused: false,
  lastInteraction: 0,
});

/** The division whose colour the page should currently wear. Preview wins over selection. */
export function focusedDivision(s: AppState): DivisionId | null {
  return s.preview ?? s.active;
}

/** True when nothing should move on its own: OS preference OR the on-page pause toggle. */
export function isStill(s: Pick<AppState, 'reducedMotion' | 'motionPaused'>): boolean {
  return s.reducedMotion || s.motionPaused;
}
