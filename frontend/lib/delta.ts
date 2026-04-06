/**
 * Immutable AG-UI state delta application.
 * Uses fast-json-patch for RFC 6902 JSON Patch operations.
 */

import { applyPatch, deepClone, type Operation } from "fast-json-patch";

/**
 * Apply a JSON Patch delta to state immutably (F3.2).
 * Deep-clones before patching so React Flow detects changes.
 * Returns a new state object; original is never mutated.
 */
export function applyStateDelta<T extends object>(
  state: T,
  delta: Operation[],
): T {
  if (!delta || delta.length === 0) return state;
  const cloned = deepClone(state);
  const { newDocument } = applyPatch(cloned, delta, true, false);
  return newDocument as T;
}

/**
 * Merge partial state update into existing state (for STATE_SNAPSHOT events).
 * Performs a shallow merge — nested objects are replaced, not deep-merged.
 */
export function mergeState<T extends object>(state: T, partial: Partial<T>): T {
  return { ...state, ...partial };
}
