/**
 * Identifies dead (trap) states in a completed automaton.
 *
 * Definition used (per spec — not a self-loop heuristic):
 * A state is dead if it is non-accepting AND no sequence of valid input
 * symbols starting from it can ever reach an accepting state.
 *
 * Approach: build the reverse transition graph, then run a BFS/DFS starting
 * from every accepting state, walking edges backwards. Every state visited
 * this way can reach an accepting state going forward. Any state never
 * visited cannot reach an accepting state — those are the dead states.
 *
 * This correctly handles states that are unreachable "loops within loops"
 * (i.e. dead states that don't merely self-loop) because it reasons about
 * reachability transitively, not just direct transitions.
 *
 * Works for both DFA transitions (`transitions[state][symbol]` is a single
 * state name) and NFA transitions (`transitions[state][symbol]` is an array
 * of state names) — anything else is ignored.
 *
 * @param {import('../contracts.js').Automaton} automaton
 * @returns {string[]} names of dead states, in the same order as automaton.states
 */
export function findDeadStates(automaton) {
  const { states, alphabet, transitions, acceptingStates } = automaton;

  const canReachAccept = new Set(acceptingStates);

  // Build the reverse adjacency list: for every edge state --symbol--> target,
  // record target -> state (i.e. "target is reachable-backwards from state").
  const reverseEdges = new Map(states.map(state => [state, []]));
  for (const state of states) {
    for (const symbol of alphabet) {
      const target = transitions[state]?.[symbol];
      const targets = Array.isArray(target) ? target : target === undefined ? [] : [target];
      for (const next of targets) {
        if (reverseEdges.has(next)) reverseEdges.get(next).push(state);
      }
    }
  }

  // BFS backwards from every accepting state to find every state that can
  // eventually reach an accepting state.
  const queue = [...acceptingStates];
  while (queue.length) {
    const current = queue.shift();
    for (const previous of reverseEdges.get(current) ?? []) {
      if (!canReachAccept.has(previous)) {
        canReachAccept.add(previous);
        queue.push(previous);
      }
    }
  }

  return states.filter(state => !canReachAccept.has(state));
}
