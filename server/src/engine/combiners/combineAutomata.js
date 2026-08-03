/** Cartesian-product construction for complete DFAs. AND intersects languages; OR unions them. */
export function combineAutomata(left, right, operator) {
  const stateName = (a, b) => `${a}__${b}`; const states = []; const transitions = {}; const queue = [[left.startState, right.startState]]; const seen = new Set();
  while (queue.length) { const [a, b] = queue.shift(); const name = stateName(a, b); if (seen.has(name)) continue; seen.add(name); states.push(name); transitions[name] = {};
    for (const symbol of left.alphabet) { const next = [left.transitions[a][symbol], right.transitions[b][symbol]]; transitions[name][symbol] = stateName(...next); if (!seen.has(transitions[name][symbol])) queue.push(next); }
  }
  const accepts = states.filter(name => { const [a, b] = name.split('__'); const leftAccepts = left.acceptingStates.includes(a); const rightAccepts = right.acceptingStates.includes(b); return operator === 'AND' ? leftAccepts && rightAccepts : leftAccepts || rightAccepts; });
  return { states, alphabet: left.alphabet, transitions, startState: stateName(left.startState, right.startState), acceptingStates: accepts, metadata: { combinedWith: operator, rules: [left.metadata, right.metadata] } };
}
export function combineRuleAutomata(automata, operators) { return automata.slice(1).reduce((result, automaton, index) => combineAutomata(result, automaton, operators[index] ?? 'AND'), automata[0]); }