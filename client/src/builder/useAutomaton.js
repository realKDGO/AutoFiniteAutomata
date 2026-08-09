import { useCallback, useReducer } from 'react';

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
  transitions: [],   // [{ id, from, to, symbols: string[] }]
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
      const { from, to, symbols } = action.payload;
      const cleanSymbols = [...new Set(symbols)].filter(Boolean);
      if (cleanSymbols.length === 0) return state;

      const existing = state.transitions.find(
        t => t.from === from && t.to === to
      );
      if (existing) {
        return {
          ...state,
          transitions: state.transitions.map(t =>
            t.id === existing.id
              ? { ...t, symbols: [...new Set([...existing.symbols, ...cleanSymbols])] }
              : t
          ),
        };
      }
      return {
        ...state,
        transitions: [
          ...state.transitions,
          { id: genId(), from, to, symbols: cleanSymbols },
        ],
      };
    }

    case 'UPDATE_TRANSITION': {
      const { id, symbols } = action.payload;
      const cleanSymbols = [...new Set(symbols)].filter(Boolean);
      if (cleanSymbols.length === 0) {
        return { ...state, transitions: state.transitions.filter(t => t.id !== id) };
      }
      return {
        ...state,
        transitions: state.transitions.map(t =>
          t.id === id ? { ...t, symbols: cleanSymbols } : t
        ),
      };
    }

    case 'REMOVE_TRANSITION': {
      const { id } = action.payload;
      return { ...state, transitions: state.transitions.filter(t => t.id !== id) };
    }

    case 'CLEAR':
      return {
        ...initialAutomaton,
        type: state.type,
        alphabet: state.alphabet,
        stateNaming: state.stateNaming,
      };

    default:
      return state;
  }
}

// ─── Derived Helpers ──────────────────────────────────────────────────────────

/** Groups transitions by (from-id, to-id) for diagram rendering. */
function buildGroupedEdges(transitions) {
  const groups = new Map();
  for (const t of transitions) {
    const key = `${t.from}\0${t.to}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        from: t.from,
        to: t.to,
        transitionIds: [],
        labels: [],
      });
    }
    const g = groups.get(key);
    g.transitionIds.push(t.id);
    g.labels.push(...t.symbols);
  }
  return [...groups.values()].map(g => ({
    ...g,
    labels: [...new Set(g.labels)],
    label: [...new Set(g.labels)].join(', '),
  }));
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAutomaton() {
  const [historyState, dispatch] = useReducer(reducer, {
    past: [],
    present: initialAutomaton,
    future: [],
  });

  const automaton = historyState.present;
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;

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
    (from, to, symbols) =>
      dispatch({ type: 'ADD_TRANSITION', payload: { from, to, symbols } }),
    []
  );
  const updateTransition = useCallback(
    (id, symbols) =>
      dispatch({ type: 'UPDATE_TRANSITION', payload: { id, symbols } }),
    []
  );
  const removeTransition = useCallback(
    id => dispatch({ type: 'REMOVE_TRANSITION', payload: { id } }),
    []
  );
  const clearAll = useCallback(() => dispatch({ type: 'CLEAR' }), []);

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
    clearAll,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
