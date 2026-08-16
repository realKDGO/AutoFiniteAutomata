// ─── Simulation History — V2.3.5 ─────────────────────────────────────────────
//
// Stores completed simulation records in LocalStorage under a dedicated key
// that is completely separate from all other AutoFA storage keys.
//
// Only completed simulations (ACCEPTED or REJECTED) are ever recorded.
// Incomplete/reset simulations are never stored.
//
// Record shape (lightweight — no canvas data, no SVG, no duplicated automaton):
// {
//   id:             string,        // unique identifier
//   index:          number,        // sequential display number (1-based)
//   input:          string,
//   result:         'ACCEPT' | 'REJECT',
//   type:           'DFA' | 'NFA',
//   startingState:  string,        // state name
//   finalState:     string,        // state name
//   path:           string[],      // ordered array of state names visited
//   automatonName:  string | null, // loaded automaton name if available
//   timestamp:      string,        // ISO 8601
// }

import { useCallback, useEffect, useState } from 'react';

const HISTORY_KEY   = 'autofa_simulation_history';
const HISTORY_LIMIT = 50;

// ── helpers ────────────────────────────────────────────────────────────────────

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Light structural validation — just enough to avoid rendering crashes.
    return parsed.filter(
      item =>
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.input === 'string' &&
        (item.result === 'ACCEPT' || item.result === 'REJECT') &&
        (item.type === 'DFA' || item.type === 'NFA') &&
        typeof item.timestamp === 'string' &&
        Array.isArray(item.path)
    );
  } catch {
    // Corrupted storage — recover gracefully with empty history.
    // Never touch unrelated LocalStorage keys.
    return [];
  }
}

function writeHistory(records) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
  } catch {
    // Quota exceeded or storage unavailable — silently ignore.
    // The in-memory state still reflects the addition; it just won't persist.
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── hook ───────────────────────────────────────────────────────────────────────

export function useSimulationHistory() {
  const [history, setHistory] = useState(() => readHistory());

  // Keep localStorage in sync whenever history changes.
  useEffect(() => {
    writeHistory(history);
  }, [history]);

  /**
   * Add a completed simulation record.
   *
   * Expected shape of `record`:
   * {
   *   input, result, type, startingState, finalState,
   *   path, automatonName, timestamp
   * }
   *
   * The hook assigns id and index automatically.
   */
  const addRecord = useCallback(record => {
    setHistory(prev => {
      const nextIndex = (prev[0]?.index ?? 0) + 1;
      const newRecord = {
        ...record,
        id:    generateId(),
        index: nextIndex,
      };
      // Prepend newest, then trim oldest beyond the limit.
      const next = [newRecord, ...prev];
      return next.length > HISTORY_LIMIT ? next.slice(0, HISTORY_LIMIT) : next;
    });
  }, []);

  /**
   * Permanently remove all simulation history from memory and LocalStorage.
   * Does NOT touch any other AutoFA LocalStorage key.
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // Storage unavailable — in-memory state was already cleared above.
    }
  }, []);

  return { history, addRecord, clearHistory };
}
