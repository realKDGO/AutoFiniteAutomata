import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getConnectorUsage } from './connectorSnap';
import { isStorageAvailable, loadAutomaton, saveAutomaton } from './automatonStorage';

// Movement (and similar rapid-fire) actions can dispatch many times a
// second; debounce writes so we only touch LocalStorage once the automaton
// settles instead of on every frame.
const AUTOSAVE_DEBOUNCE_MS = 400;

// ─── ID / Naming Helpers ─────────────────────────────────────────────────────

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function nextStateName(stateNaming, existingNames) {
  const names = new Set(existingNames);
  if (stateNaming === 'q') {
    let i = 0;
    while (names.has(`q${i}`)) i++;
    return `q${i}`;
  }
  if (stateNaming === 'number') {
    let i = 0;
    while (names.has(String(i))) i++;
    return String(i);
  }
  // alphabet (default)
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const l of letters) if (!names.has(l)) return l;
  for (const l1 of letters)
    for (const l2 of letters) {
      const n = l1 + l2;
      if (!names.has(n)) return n;
    }
  return `S${existingNames.length}`;
}

function defaultPosition(stateCount) {
  const col = stateCount % 4;
  const row = Math.floor(stateCount / 4);
  return { x: 150 + col * 210, y: 160 + row * 185 };
}

// ─── Initial State ────────────────────────────────────────────────────────────

const initialAutomaton = {
  type: 'DFA',       // 'DFA' | 'NFA'
  alphabet: ['0', '1'],
  stateNaming: 'alphabet', // 'alphabet' | 'q' | 'number'
  states: [],        // [{ id, name, initial, accepting, dead, position: {x,y} }]
  transitions: [],   // [{ id, from, to, sourceConnectorId, targetConnectorId, symbols }]
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(historyState, action) {
  const { past, present, future } = historyState;

  switch (action.type) {
    case 'UNDO': {
      if (past.length === 0) return historyState;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      return {
        past: newPast,
        present: previous,
        future: [present, ...future],
      };
    }

    case 'REDO': {
      if (future.length === 0) return historyState;
      const next = future[0];
      const newFuture = future.slice(1);
      return {
        past: [...past, present],
        present: next,
        future: newFuture,
      };
    }

    default: {
      const nextPresent = automatonReducer(present, action);
      if (nextPresent === present) return historyState;
      return {
        past: [...past, present],
        present: nextPresent,
        future: [],
      };
    }
  }
}

function automatonReducer(state, action) {
  switch (action.type) {

    case 'SET_TYPE':
      return { ...state, type: action.payload };

    case 'SET_ALPHABET': {
      const newAlpha = action.payload;
      // Drop symbols that are no longer in the alphabet from every transition
      const transitions = state.transitions
        .map(t => ({ ...t, symbols: t.symbols.filter(s => newAlpha.includes(s)) }))
        .filter(t => t.symbols.length > 0);
      return { ...state, alphabet: newAlpha, transitions };
    }

    case 'SET_STATE_NAMING':
      return { ...state, stateNaming: action.payload };

    case 'ADD_STATE': {
      const name = nextStateName(
        state.stateNaming,
        state.states.map(s => s.name)
      );
      const position = action.payload?.position ?? defaultPosition(state.states.length);
      const isFirst = state.states.length === 0;
      const newState = {
        id: genId(),
        name,
        initial: isFirst,
        accepting: false,
        dead: false,
        position,
      };
      return { ...state, states: [...state.states, newState] };
    }

    case 'REMOVE_STATE': {
      const { id } = action.payload;
      return {
        ...state,
        states: state.states.filter(s => s.id !== id),
        transitions: state.transitions.filter(
          t => t.from !== id && t.to !== id
        ),
      };
    }

    case 'UPDATE_STATE': {
      const { id, updates } = action.payload;
      // Prevent duplicate names
      if (updates.name) {
        const collision = state.states.some(
          s => s.id !== id && s.name === updates.name
        );
        if (collision) return state;
      }
      return {
        ...state,
        states: state.states.map(s => (s.id === id ? { ...s, ...updates } : s)),
      };
    }

    case 'MOVE_STATE': {
      const { id, x, y } = action.payload;
      return {
        ...state,
        states: state.states.map(s =>
          s.id === id ? { ...s, position: { x, y } } : s
        ),
      };
    }

    case 'SET_INITIAL': {
      const { id } = action.payload;
      return {
        ...state,
        states: state.states.map(s => ({ ...s, initial: s.id === id })),
      };
    }

    case 'TOGGLE_ACCEPTING': {
      const { id } = action.payload;
      return {
        ...state,
        states: state.states.map(s =>
          s.id === id ? { ...s, accepting: !s.accepting } : s
        ),
      };
    }

    case 'TOGGLE_DEAD': {
      const { id } = action.payload;
      return {
        ...state,
        states: state.states.map(s => {
          if (s.id !== id) return s;
          const nowDead = !s.dead;
          return { ...s, dead: nowDead, accepting: nowDead ? false : s.accepting };
        }),
      };
    }

    case 'ADD_TRANSITION': {
      const { from, to, symbols, sourceConnectorId = 2, targetConnectorId = 6 } = action.payload;
      const cleanSymbols = [...new Set(symbols)].filter(Boolean);
      if (cleanSymbols.length === 0) return state;
      if (!state.states.some(s => s.id === from) || !state.states.some(s => s.id === to)) return state;
      if (![sourceConnectorId, targetConnectorId].every(id => Number.isInteger(id) && id >= 0 && id < 8)) return state;
      if (from === to && sourceConnectorId === targetConnectorId) return state;
      if (getConnectorUsage(state.transitions, from, sourceConnectorId) >= 2) return state;
      if (getConnectorUsage(state.transitions, to, targetConnectorId) >= 2) return state;
      return {
        ...state,
        transitions: [
          ...state.transitions,
          { id: genId(), from, to, sourceConnectorId, targetConnectorId, symbols: cleanSymbols },
        ],
      };
    }

    case 'UPDATE_TRANSITION': {
      const { id, symbols, sourceConnectorId, targetConnectorId, from, to } = action.payload;
      const cleanSymbols = [...new Set(symbols)].filter(Boolean);
      if (cleanSymbols.length === 0) {
        return { ...state, transitions: state.transitions.filter(t => t.id !== id) };
      }
      const current = state.transitions.find(t => t.id === id);
      if (!current) return state;
      const nextFrom = from ?? current.from;
      const nextTo = to ?? current.to;
      if (!state.states.some(s => s.id === nextFrom) || !state.states.some(s => s.id === nextTo)) return state;
      const nextSource = sourceConnectorId ?? current.sourceConnectorId ?? 2;
      const nextTarget = targetConnectorId ?? current.targetConnectorId ?? 6;
      if (![nextSource, nextTarget].every(connector => Number.isInteger(connector) && connector >= 0 && connector < 8)) return state;
      if (nextFrom === nextTo && nextSource === nextTarget) return state;
      if (getConnectorUsage(state.transitions, nextFrom, nextSource, id) >= 2) return state;
      if (getConnectorUsage(state.transitions, nextTo, nextTarget, id) >= 2) return state;
      return {
        ...state,
        transitions: state.transitions.map(t =>
          t.id === id ? { ...t, from: nextFrom, to: nextTo, symbols: cleanSymbols, sourceConnectorId: nextSource, targetConnectorId: nextTarget } : t
        ),
      };
    }

    case 'REMOVE_TRANSITION': {
      const { id } = action.payload;
      return { ...state, transitions: state.transitions.filter(t => t.id !== id) };
    }

    // Manual bend geometry is purely visual override data attached to the
    // transition — it never creates fake states/connectors and never
    // touches from/to/sourceConnectorId/targetConnectorId. `bend` is either
    // null (use automatic routing) or { dx, dy }: an offset in SVG-space
    // units applied to the transition's current start/end midpoint.
    case 'SET_TRANSITION_BEND': {
      const { id, bend } = action.payload;
      const current = state.transitions.find(t => t.id === id);
      if (!current) return state;
      return {
        ...state,
        transitions: state.transitions.map(t => (t.id === id ? { ...t, bend } : t)),
      };
    }

    case 'CLEAR':
      return {
        ...initialAutomaton,
        type: state.type,
        alphabet: state.alphabet,
        stateNaming: state.stateNaming,
      };

    // V2.3.2: replace the whole working automaton with a previously saved
    // one. The payload is expected to already be a sanitized, well-formed
    // automaton (see automatonStorage.getSavedAutomatonForLoad) — this
    // reducer trusts its caller the same way CLEAR trusts initialAutomaton.
    case 'LOAD_AUTOMATON':
      return action.payload;

    default:
      return state;
  }
}

// ─── Derived Helpers ──────────────────────────────────────────────────────────

/** Every transition remains a distinct visual edge: connectors are data, not
 * a property of a merged SVG path. */
function buildGroupedEdges(transitions) {
  return transitions.map(t => ({
    key: t.id,
    from: t.from,
    to: t.to,
    sourceConnectorId: t.sourceConnectorId ?? 2,
    targetConnectorId: t.targetConnectorId ?? 6,
    transitionIds: [t.id],
    labels: t.symbols,
    label: t.symbols.join(', '),
    bend: t.bend ?? null,
  }));
}

// ─── Hook ────────────────────────────────────────────────────────────────────

function initHistoryState() {
  const restored = loadAutomaton();
  return {
    past: [],
    present: restored ?? initialAutomaton,
    future: [],
  };
}

export function useAutomaton() {
  const [historyState, dispatch] = useReducer(reducer, undefined, initHistoryState);

  const automaton = historyState.present;
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;

  // ── Auto-save (V2.3.1) ───────────────────────────────────────────────────
  // Persist only the committed `present` automaton — history (past/future)
  // and any in-progress interaction state elsewhere in the app are never
  // written. Debounced so rapid changes (e.g. holding a move button) collapse
  // into a single write once things settle.
  const [persistenceAvailable, setPersistenceAvailable] = useState(() => isStorageAvailable());
  const saveTimeoutRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    // Skip the write on mount: we just restored (or intentionally started
    // clean from) this exact state, so re-saving it is redundant.
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return undefined;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const ok = saveAutomaton(automaton);
      setPersistenceAvailable(ok);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [automaton]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const stateById = Object.fromEntries(automaton.states.map(s => [s.id, s]));
  const groupedEdges = buildGroupedEdges(automaton.transitions);

  /** Convert builder model to the format consumed by the existing API / diagramUtils. */
  function toSimulatorAutomaton() {
    const initial = automaton.states.find(s => s.initial);
    const accepting = automaton.states.filter(s => s.accepting).map(s => s.name);
    const dead = automaton.states.filter(s => s.dead).map(s => s.name);

    const transitions = {};
    for (const s of automaton.states) {
      transitions[s.name] = {};
      for (const sym of automaton.alphabet) {
        const outgoing = automaton.transitions.filter(
          t => t.from === s.id && t.symbols.includes(sym)
        );
        if (automaton.type === 'DFA') {
          transitions[s.name][sym] =
            outgoing.length > 0 ? stateById[outgoing[0].to]?.name ?? null : null;
        } else {
          transitions[s.name][sym] = outgoing
            .map(t => stateById[t.to]?.name)
            .filter(Boolean);
        }
      }
    }

    return {
      kind: automaton.type.toLowerCase(),
      alphabet: automaton.alphabet,
      states: automaton.states.map(s => s.name),
      startState: initial?.name ?? '',
      acceptingStates: accepting,
      deadStates: dead,
      transitions,
    };
  }

  /** Build the transition table data structure for the table component. */
  function getTransitionTable() {
    return {
      type: automaton.type,
      states: automaton.states,
      alphabet: automaton.alphabet,
      transitions: automaton.transitions,
      stateById,
    };
  }

  // ── Action creators ──────────────────────────────────────────────────────

  const setType = useCallback(
    t => dispatch({ type: 'SET_TYPE', payload: t }),
    []
  );
  const setAlphabet = useCallback(
    a => dispatch({ type: 'SET_ALPHABET', payload: a }),
    []
  );
  const setStateNaming = useCallback(
    n => dispatch({ type: 'SET_STATE_NAMING', payload: n }),
    []
  );
  const addState = useCallback(
    opts => dispatch({ type: 'ADD_STATE', payload: opts }),
    []
  );
  const removeState = useCallback(
    id => dispatch({ type: 'REMOVE_STATE', payload: { id } }),
    []
  );
  const updateState = useCallback(
    (id, updates) => dispatch({ type: 'UPDATE_STATE', payload: { id, updates } }),
    []
  );
  const moveState = useCallback(
    (id, x, y) => dispatch({ type: 'MOVE_STATE', payload: { id, x, y } }),
    []
  );
  const setInitialState = useCallback(
    id => dispatch({ type: 'SET_INITIAL', payload: { id } }),
    []
  );
  const toggleAccepting = useCallback(
    id => dispatch({ type: 'TOGGLE_ACCEPTING', payload: { id } }),
    []
  );
  const toggleDead = useCallback(
    id => dispatch({ type: 'TOGGLE_DEAD', payload: { id } }),
    []
  );
  const addTransition = useCallback(
    (from, to, symbols, sourceConnectorId = 2, targetConnectorId = 6) =>
      dispatch({ type: 'ADD_TRANSITION', payload: { from, to, symbols, sourceConnectorId, targetConnectorId } }),
    []
  );
  const updateTransition = useCallback(
    (id, symbols, sourceConnectorId, targetConnectorId, from, to) =>
      dispatch({ type: 'UPDATE_TRANSITION', payload: { id, symbols, sourceConnectorId, targetConnectorId, from, to } }),
    []
  );
  const removeTransition = useCallback(
    id => dispatch({ type: 'REMOVE_TRANSITION', payload: { id } }),
    []
  );
  const setTransitionBend = useCallback(
    (id, bend) => dispatch({ type: 'SET_TRANSITION_BEND', payload: { id, bend } }),
    []
  );
  const clearAll = useCallback(() => dispatch({ type: 'CLEAR' }), []);
  const loadAutomatonIntoBuilder = useCallback(
    loaded => dispatch({ type: 'LOAD_AUTOMATON', payload: loaded }),
    []
  );

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  return {
    automaton,
    stateById,
    groupedEdges,
    toSimulatorAutomaton,
    getTransitionTable,
    setType,
    setAlphabet,
    setStateNaming,
    addState,
    removeState,
    updateState,
    moveState,
    setInitialState,
    toggleAccepting,
    toggleDead,
    addTransition,
    updateTransition,
    removeTransition,
    setTransitionBend,
    clearAll,
    loadAutomatonIntoBuilder,
    undo,
    redo,
    canUndo,
    canRedo,
    persistenceAvailable,
  };
}
