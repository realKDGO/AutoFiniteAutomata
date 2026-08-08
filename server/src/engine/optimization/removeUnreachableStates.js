/**
 * Removes unreachable states from an automaton starting from the startState.
 * Works for both DFAs (scalar targets) and NFAs (array targets).
 *
 * @param {import('../contracts.js').Automaton} automaton
 * @returns {import('../contracts.js').Automaton}
 */
export function removeUnreachableStates(automaton) {
  const { states, alphabet, transitions, startState, acceptingStates } = automaton;

  if (!states.includes(startState)) {
    return automaton;
  }

  const reachable = new Set([startState]);
  const queue = [startState];

  while (queue.length > 0) {
    const current = queue.shift();
    const stateTransitions = transitions[current] ?? {};

    for (const symbol of alphabet) {
      const target = stateTransitions[symbol];
      if (target === undefined || target === null) continue;

      const targets = Array.isArray(target) ? target : [target];
      for (const next of targets) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
  }

  const filteredStates = states.filter(s => reachable.has(s));
  const filteredAccepting = acceptingStates.filter(s => reachable.has(s));

  const filteredTransitions = {};
  for (const s of filteredStates) {
    filteredTransitions[s] = {};
    const stateTrans = transitions[s] ?? {};
    for (const symbol of alphabet) {
      const target = stateTrans[symbol];
      if (Array.isArray(target)) {
        filteredTransitions[s][symbol] = target.filter(t => reachable.has(t));
      } else if (target !== undefined && reachable.has(target)) {
        filteredTransitions[s][symbol] = target;
      }
    }
  }

  return {
    ...automaton,
    states: filteredStates,
    acceptingStates: filteredAccepting,
    transitions: filteredTransitions,
  };
}
