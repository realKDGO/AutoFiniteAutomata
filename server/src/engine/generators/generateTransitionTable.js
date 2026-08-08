import { findDeadStates } from '../utils/findDeadStates.js';

export function generateTransitionTable(automaton, deadStates = findDeadStates(automaton)) {
  return {
    states: automaton.states,
    alphabet: automaton.alphabet,
    transitions: automaton.transitions,
    startState: automaton.startState,
    acceptStates: automaton.acceptingStates,
    deadStates,
  };
}
