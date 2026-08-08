function alphabetName(index) {
  let name = '';
  let value = index;
  do {
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return name;
}

function nameFor(index, style) {
  if (style === 'alphabet') return alphabetName(index);
  if (style === 'number') return String(index);
  return `q${index}`;
}

/**
 * Reorders and relabels an automaton's states cleanly.
 * Ensures the startState is always the first state (index 0 -> 'A' / 'q0' / '0').
 * Uses BFS order from startState for intuitive discovery sequence.
 *
 * @param {import('../contracts.js').Automaton} automaton
 * @param {'q' | 'alphabet' | 'number'} style
 * @returns {import('../contracts.js').Automaton}
 */
export function renameStates(automaton, style = 'q') {
  const { states, startState, alphabet, transitions, acceptingStates } = automaton;

  // BFS traversal to discover states in order starting from startState
  const orderedStates = [];
  const visited = new Set();

  if (states.includes(startState)) {
    visited.add(startState);
    orderedStates.push(startState);
    const queue = [startState];

    while (queue.length > 0) {
      const current = queue.shift();
      const stateTrans = transitions[current] ?? {};
      for (const symbol of alphabet) {
        const target = stateTrans[symbol];
        if (target === undefined || target === null) continue;
        const targets = Array.isArray(target) ? target : [target];
        for (const next of targets) {
          if (states.includes(next) && !visited.has(next)) {
            visited.add(next);
            orderedStates.push(next);
            queue.push(next);
          }
        }
      }
    }
  }

  // Include any remaining states not reached by BFS
  for (const s of states) {
    if (!visited.has(s)) {
      visited.add(s);
      orderedStates.push(s);
    }
  }

  const mapping = Object.fromEntries(orderedStates.map((state, index) => [state, nameFor(index, style)]));

  const renameTarget = target => {
    if (Array.isArray(target)) return target.map(item => mapping[item] ?? item);
    return mapping[target] ?? target;
  };

  const newStates = orderedStates.map(state => mapping[state]);
  const newTransitions = {};

  for (const state of orderedStates) {
    const newName = mapping[state];
    newTransitions[newName] = {};
    const stateTrans = transitions[state] ?? {};
    for (const symbol of Object.keys(stateTrans)) {
      newTransitions[newName][symbol] = renameTarget(stateTrans[symbol]);
    }
  }

  return {
    ...automaton,
    states: newStates,
    startState: mapping[startState] ?? startState,
    acceptingStates: acceptingStates.map(state => mapping[state] ?? state),
    transitions: newTransitions,
  };
}