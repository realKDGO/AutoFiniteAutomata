import { useCallback, useEffect, useRef, useState } from 'react';

export const SIMULATION_SPEEDS = {
  slow:   1200,
  normal:  700,
  fast:    350,
};

// Fraction of the step duration devoted to the travelling indicator.
export const ANIMATION_FRACTION = 0.78;

const idleSession = input => ({
  input,
  index: 0,
  currentStateId: null,
  currentStates: [],
  previousStateId: null,
  activeTransitionId: null,
  activeTransitionIds: [],
  activeSymbol: null,
  status: 'IDLE',
  result: null,
  isPlaying: false,
  isAnimating: false,
  isDead: false,
  animationVersion: 0,
  error: '',
  // Explicit terminal indicator state — set only by finish(), and only ever
  // read once the simulation is ACCEPTED/REJECTED. Kept separate from
  // currentStateId/currentStates (which, for an NFA, can hold several
  // simultaneously-active states) so the canvas indicator has one
  // unambiguous, deterministic state to rest on after the run ends instead
  // of picking an arbitrary — or stale — entry.
  finalStateId: null,
});

export function useBuilderSimulation(automaton) {
  const [session, setSession] = useState(() => idleSession(''));
  const [speed, setSpeed] = useState('normal');
  const timerRef   = useRef(null);
  const sessionRef = useRef(session);
  // Accumulates state names visited during the current run.
  // Reset on reset() and on re-initialisation. Captured into the
  // session by finish() so BuilderPage can build a history record.
  const pathRef = useRef([]);

  // ── helpers ──────────────────────────────────────────────────────────────

  const commit = useCallback(next => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    pathRef.current = [];
    commit(idleSession(sessionRef.current.input));
  }, [clearTimer, commit]);

  const setInput = useCallback(input => {
    clearTimer();
    pathRef.current = [];
    commit(idleSession(input));
  }, [clearTimer, commit]);

  const finish = useCallback((base, result, error = '') => {
    clearTimer();

    // Pick ONE deterministic state for the indicator to rest on once the run
    // is over. For an NFA, `base.currentStates` may hold several
    // simultaneously-active paths — naively taking the last entry is not
    // reliable (array order isn't meaningful) and can land the indicator on
    // a non-accepting, even non-final, state. Instead:
    //   ACCEPT  → the active state that is actually accepting (that's the
    //             state the ACCEPT result is based on).
    //   REJECT  → the active DEAD state if the run died, otherwise whatever
    //             state the simulation actually stopped in.
    const activeIds = base.currentStates?.length
      ? base.currentStates
      : [base.currentStateId].filter(Boolean);
    const activeStateObjs = automaton.states.filter(s => activeIds.includes(s.id));

    let finalStateId = base.currentStateId ?? activeIds[0] ?? null;
    if (result === 'ACCEPT') {
      const acceptingActive = activeStateObjs.find(s => s.accepting);
      if (acceptingActive) finalStateId = acceptingActive.id;
    } else {
      const deadActive = activeStateObjs.find(s => s.dead);
      if (deadActive) finalStateId = deadActive.id;
    }

    commit({
      ...base,
      activeTransitionId: null,
      activeTransitionIds: [],
      activeSymbol: null,
      isPlaying: false,
      isAnimating: false,
      status: result === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
      result,
      error,
      finalStateId,
      // Snapshot the path at the moment of completion so BuilderPage can
      // build a history record. Sliced to avoid sharing the mutable ref.
      sessionPath: pathRef.current.slice(),
      // Stable timestamp used as a deduplication key by the auto-record
      // useEffect in BuilderPage — ensures the same completed session is
      // never recorded twice, even under React strict-mode double-effects.
      timestamp: new Date().toISOString(),
    });
  }, [clearTimer, commit, automaton.states]);

  // ── core step ─────────────────────────────────────────────────────────────

  const executeStepRef = useRef(null);

  const executeStep = useCallback((auto = false) => {
    const current = sessionRef.current;
    if (current.isAnimating) return;

    // Validate all symbols before starting
    const invalid = [...current.input].find(symbol => !automaton.alphabet.includes(symbol));
    if (invalid) {
      finish(current, 'REJECT', `Input contains '${invalid}', which is not in the automaton alphabet.`);
      return;
    }

    // Initialise or re-start from terminal state
    let base = current;
    if (current.status === 'IDLE' || current.result) {
      const initial = automaton.states.find(state => state.initial);
      if (!initial) {
        finish(current, 'REJECT', 'Cannot simulate: no initial state is designated.');
        return;
      }
      // Reset path and seed with the initial state name.
      pathRef.current = [initial.name ?? initial.id];
      base = {
        ...idleSession(current.input),
        currentStateId: initial.id,
        currentStates: [initial.id],
        status: auto ? 'RUNNING' : 'PAUSED',
        isPlaying: auto,
      };
      commit(base);
    } else if (auto && !current.isPlaying) {
      base = { ...current, status: 'RUNNING', isPlaying: true };
      commit(base);
    }

    // Check if we're already past the end of the input (empty input or complete)
    if (base.index >= base.input.length) {
      const activeStateIds = base.currentStates?.length ? base.currentStates : [base.currentStateId].filter(Boolean);
      const activeStates = automaton.states.filter(state => activeStateIds.includes(state.id));
      const hasAccepting = activeStates.some(state => state.accepting);
      finish(base, hasAccepting && !base.isDead ? 'ACCEPT' : 'REJECT');
      return;
    }

    // Current active states
    const activeStateIds = base.currentStates?.length ? base.currentStates : [base.currentStateId].filter(Boolean);
    const symbol = base.input[base.index];

    // Find ALL matching outgoing transitions from any currently active state
    const matchingTransitions = automaton.transitions.filter(
      t => activeStateIds.includes(t.from) && t.symbols.includes(symbol)
    );

    // ── DFA Transition Logic ──────────────────────────────────────────────
    if (automaton.type === 'DFA') {
      if (matchingTransitions.length === 0) {
        const currStateObj = automaton.states.find(s => s.id === base.currentStateId);
        finish(base, 'REJECT', `No transition from state '${currStateObj?.name ?? ''}' accepts '${symbol}'.`);
        return;
      }

      if (matchingTransitions.length > 1) {
        const conflictingStates = [...new Set(matchingTransitions.map(t => automaton.states.find(s => s.id === t.from)?.name).filter(Boolean))];
        finish(base, 'REJECT', `DFA Conflict: State '${conflictingStates.join(', ')}' has multiple transitions for symbol '${symbol}'. A DFA cannot have ambiguous transitions.`);
        return;
      }
    }

    // ── NFA Transition Logic ──────────────────────────────────────────────
    if (matchingTransitions.length === 0) {
      finish(base, 'REJECT', `No transition accepts symbol '${symbol}'.`);
      return;
    }

    // Kick off animation phase
    const animDuration = Math.round(SIMULATION_SPEEDS[speed] * ANIMATION_FRACTION);
    const settlingPause = Math.max(60, SIMULATION_SPEEDS[speed] - animDuration);
    const activeTransitionIds = matchingTransitions.map(t => t.id);
    const primaryTransition = matchingTransitions[0];

    const animating = {
      ...base,
      activeTransitionId: primaryTransition.id,
      activeTransitionIds,
      activeSymbol: symbol,
      status: auto ? 'RUNNING' : 'PAUSED',
      isPlaying: auto,
      isAnimating: true,
      animationVersion: base.animationVersion + 1,
      animationDuration: animDuration,
      error: '',
    };
    commit(animating);

    timerRef.current = window.setTimeout(() => {
      const latest = sessionRef.current;
      const nextStateIds = [...new Set(matchingTransitions.map(t => t.to))];
      const nextStates = automaton.states.filter(s => nextStateIds.includes(s.id));

      // Record the destination state(s) into the path.
      // For NFA, when multiple states are reached simultaneously, record
      // all of them joined by '/' so the path remains a flat string array.
      const nextStateNames = nextStates.map(s => s.name ?? s.id);
      const pathEntry = nextStateNames.length === 1
        ? nextStateNames[0]
        : nextStateNames.join('/');
      pathRef.current.push(pathEntry);

      const next = {
        ...latest,
        previousStateId: primaryTransition.from,
        currentStateId: nextStateIds[0] ?? null,
        currentStates: nextStateIds,
        index: latest.index + 1, // Advance index by EXACTLY 1
        activeTransitionId: null,
        activeTransitionIds: [],
        activeSymbol: null,
        isAnimating: false,
        isDead: latest.isDead || (nextStates.length > 0 && nextStates.every(s => s.dead)),
      };

      if (next.index >= next.input.length) {
        const finalStateObjs = automaton.states.filter(s => next.currentStates.includes(s.id));
        const hasAccepting = finalStateObjs.some(s => s.accepting);
        finish(next, hasAccepting && !next.isDead ? 'ACCEPT' : 'REJECT');
        return;
      }

      const continuePlaying = latest.isPlaying;
      const settled = {
        ...next,
        status: continuePlaying ? 'RUNNING' : 'PAUSED',
        isPlaying: continuePlaying,
      };
      commit(settled);

      if (continuePlaying) {
        timerRef.current = window.setTimeout(
          () => executeStepRef.current?.(true),
          settlingPause
        );
      }
    }, animDuration);
  }, [automaton.alphabet, automaton.states, automaton.transitions, automaton.type, commit, finish, speed]);

  executeStepRef.current = executeStep;

  const play     = useCallback(() => executeStep(true),  [executeStep]);
  const nextStep = useCallback(() => executeStep(false), [executeStep]);
  const pause    = useCallback(() => {
    const current = sessionRef.current;
    if (!current.isPlaying) return;
    commit({ ...current, isPlaying: false, status: 'PAUSED' });
  }, [commit]);

  // True ONLY while simulation is actively running, paused mid-run, or animating step.
  // Terminal states (ACCEPTED, REJECTED, IDLE) return false, leaving Builder canvas immediately editable.
  const simulationActive = (session.status === 'RUNNING' || session.status === 'PAUSED') || session.isAnimating;

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    session,
    speed,
    setSpeed,
    setInput,
    play,
    pause,
    nextStep,
    reset,
    simulationActive,
  };
}
