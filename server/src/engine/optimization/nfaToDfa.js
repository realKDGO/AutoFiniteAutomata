/**
 * Computes epsilon closure for a given set of initial states in an NFA.
 *
 * @param {import('../contracts.js').Automaton} automaton
 * @param {string[]} initialStates
 * @returns {string[]} sorted array of state names in closure
 */
export function epsilonClosure(automaton, initialStates) {
  const closure = new Set(initialStates);
  const stack = [...initialStates];

  while (stack.length > 0) {
    const current = stack.pop();
    const epsTargets = automaton.transitions[current]?.epsilon ?? [];
    const targets = Array.isArray(epsTargets) ? epsTargets : [epsTargets];
    for (const t of targets) {
      if (t && !closure.has(t)) {
        closure.add(t);
        stack.push(t);
      }
    }
  }

  return Array.from(closure).sort();
}

/**
 * Converts an NFA to a DFA using subset construction.
 * Normalizes state sets (e.g. {A, B} and {B, A} become identical).
 *
 * @param {import('../contracts.js').Automaton} automaton
 * @returns {import('../contracts.js').Automaton} equivalent DFA
 */
export function nfaToDfa(automaton) {
  const { alphabet, acceptingStates, startState } = automaton;
  const acceptSet = new Set(acceptingStates);

  const initialClosure = epsilonClosure(automaton, [startState]);
  const subsetKey = subset => JSON.stringify(subset);

  const startKey = subsetKey(initialClosure);

  const seenSubsets = new Map();
  seenSubsets.set(startKey, initialClosure);

  const queue = [startKey];
  const dfaTransitions = {};

  while (queue.length > 0) {
    const currKey = queue.shift();
    const currSubset = seenSubsets.get(currKey);

    dfaTransitions[currKey] = {};

    for (const symbol of alphabet) {
      const nextNfaStates = new Set();
      for (const nfaState of currSubset) {
        const targets = automaton.transitions[nfaState]?.[symbol] ?? [];
        const targetArray = Array.isArray(targets) ? targets : (targets !== undefined ? [targets] : []);
        for (const t of targetArray) {
          if (t) nextNfaStates.add(t);
        }
      }

      const closedNext = epsilonClosure(automaton, Array.from(nextNfaStates));
      const nextKey = subsetKey(closedNext);

      if (!seenSubsets.has(nextKey)) {
        seenSubsets.set(nextKey, closedNext);
        queue.push(nextKey);
      }

      dfaTransitions[currKey][symbol] = nextKey;
    }
  }

  const dfaStates = Array.from(seenSubsets.keys());
  const dfaAcceptingStates = dfaStates.filter(key => {
    const subset = seenSubsets.get(key);
    return subset.some(s => acceptSet.has(s));
  });

  return {
    kind: 'dfa',
    states: dfaStates,
    alphabet: [...alphabet],
    transitions: dfaTransitions,
    startState: startKey,
    acceptingStates: dfaAcceptingStates,
    metadata: {
      ...automaton.metadata,
      convertedFromNfa: true,
    },
  };
}
