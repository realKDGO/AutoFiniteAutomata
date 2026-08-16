import { findDeadStates } from '../utils/findDeadStates.js';

export function toNfa(automaton) {
  const deadStates = new Set(findDeadStates(automaton));
  const nfaStates = automaton.states.filter(s => !deadStates.has(s) || s === automaton.startState);

  const nfaTransitions = {};
  for (const state of nfaStates) {
    nfaTransitions[state] = {};
    for (const symbol of automaton.alphabet) {
      const target = automaton.transitions[state]?.[symbol];
      if (target === undefined || target === null) {
        nfaTransitions[state][symbol] = null;
        continue;
      }

      const targets = Array.isArray(target) ? target : [target];
      const validTargets = targets.filter(t => !deadStates.has(t) && nfaStates.includes(t));
      nfaTransitions[state][symbol] = validTargets.length > 0 ? validTargets : null;
    }
  }

  return {
    ...automaton,
    kind: 'nfa',
    states: nfaStates,
    acceptingStates: automaton.acceptingStates.filter(s => !deadStates.has(s)),
    transitions: nfaTransitions,
  };
}

export function validateAutomaton(automaton, kind = 'dfa') {
  const issues = [];
  const set = new Set(automaton.states);

  if (!automaton.startState || !set.has(automaton.startState)) {
    issues.push('The start state is missing or invalid.');
  }

  for (const state of automaton.states) {
    for (const symbol of automaton.alphabet) {
      const target = automaton.transitions[state]?.[symbol];
      if (target === undefined || target === null) {
        if (kind === 'dfa') {
          issues.push(`Missing DFA transition from ${state} on ${symbol}.`);
        }
        continue;
      }

      const targets = Array.isArray(target) ? target : [target];

      if (kind === 'dfa') {
        if (Array.isArray(target) || targets.length !== 1) {
          issues.push(`DFA transition from ${state} on ${symbol} must have exactly one target state.`);
        }
      }

      for (const next of targets) {
        if (next && !set.has(next)) {
          issues.push(`Transition from ${state} on ${symbol} references unknown state ${next}.`);
        }
      }
    }
  }

  if (automaton.acceptingStates.some(state => !set.has(state))) {
    issues.push('An accepting state is missing from states array.');
  }

  // Reachability check
  if (automaton.startState && set.has(automaton.startState)) {
    const reachable = new Set([automaton.startState]);
    const queue = [automaton.startState];

    while (queue.length > 0) {
      const current = queue.shift();
      const stateTrans = automaton.transitions[current] ?? {};
      for (const symbol of automaton.alphabet) {
        const target = stateTrans[symbol];
        if (target === undefined || target === null) continue;
        const targets = Array.isArray(target) ? target : [target];
        for (const next of targets) {
          if (next && set.has(next) && !reachable.has(next)) {
            reachable.add(next);
            queue.push(next);
          }
        }
      }
    }

    if (reachable.size !== set.size) {
      const unreachable = automaton.states.filter(s => !reachable.has(s));
      issues.push(`Automaton contains unreachable states: ${unreachable.join(', ')}.`);
    }
  }

  return { valid: issues.length === 0, issues };
}