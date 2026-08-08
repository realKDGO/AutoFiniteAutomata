import { findDeadStates } from '../utils/findDeadStates.js';

export function generateStateDescriptions(automaton, deadStates = findDeadStates(automaton)) {
  const deadSet = new Set(deadStates);
  return automaton.states.map(state => {
    const initial = state === automaton.startState;
    const accepting = automaton.acceptingStates.includes(state);
    const dead = deadSet.has(state);
    let description = initial ? 'Initial state. Reading begins here.' : 'Tracks progress while reading the input.';
    if (accepting) description += ' Accepting state: the input satisfies the language definition if it ends here.';
    if (dead) description += ' This is a dead (trap) state. Once entered, no sequence of valid inputs can reach an accepting state.';
    return { state, initial, accepting, dead, description };
  });
}
