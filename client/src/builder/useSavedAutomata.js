import { useCallback, useState } from 'react';
import {
  listSavedAutomata,
  getSavedAutomatonForLoad,
  createSavedAutomaton,
  updateSavedAutomaton,
  deleteSavedAutomaton,
  findSavedAutomatonIdByName,
} from './automatonStorage';

/**
 * Thin React wrapper around the named Saved Automata store
 * (automatonStorage.js). Keeps a live `entries` list in state and refreshes
 * it after any mutation, so the Save/Load panel re-renders without callers
 * having to manage that themselves.
 */
export function useSavedAutomata() {
  const [entries, setEntries] = useState(() => listSavedAutomata());

  const refresh = useCallback(() => {
    setEntries(listSavedAutomata());
  }, []);

  /**
   * Saves `automaton` under `name`.
   * - Pass `overwriteId` to explicitly update an existing entry.
   * - Without it, a name collision is reported back as
   *   { ok: false, error: 'duplicate-name', existingId } instead of silently
   *   overwriting — the caller decides what happens next.
   */
  const save = useCallback((name, automaton, { overwriteId } = {}) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: 'name-required' };
    if (!automaton?.states || automaton.states.length === 0) {
      return { ok: false, error: 'empty-automaton' };
    }

    if (overwriteId) {
      const result = updateSavedAutomaton(overwriteId, trimmed, automaton);
      if (result.ok) refresh();
      return result;
    }

    const existingId = findSavedAutomatonIdByName(trimmed);
    if (existingId) {
      return { ok: false, error: 'duplicate-name', existingId };
    }

    const result = createSavedAutomaton(trimmed, automaton);
    if (result.ok) refresh();
    return result;
  }, [refresh]);

  const loadById = useCallback(id => getSavedAutomatonForLoad(id), []);

  const remove = useCallback(id => {
    const ok = deleteSavedAutomaton(id);
    if (ok) refresh();
    return ok;
  }, [refresh]);

  return { entries, refresh, save, loadById, remove };
}
