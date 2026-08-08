/** Cartesian-product construction for complete DFAs. AND intersects languages; OR unions them. */
export function combineAutomata(left, right, operator) {
  // Serialize pair members structurally: either member may itself be the
  // result of a product construction, so a delimiter-based name is ambiguous.
  const stateName = (a, b) => JSON.stringify([a, b]); const states = []; const transitions = {}; const queue = [[left.startState, right.startState]]; const seen = new Set();
  while (queue.length) { const [a, b] = queue.shift(); const name = stateName(a, b); if (seen.has(name)) continue; seen.add(name); states.push(name); transitions[name] = {};
    for (const symbol of left.alphabet) { const next = [left.transitions[a][symbol], right.transitions[b][symbol]]; transitions[name][symbol] = stateName(...next); if (!seen.has(transitions[name][symbol])) queue.push(next); }
  }
  const accepts = states.filter(name => { const [a, b] = JSON.parse(name); const leftAccepts = left.acceptingStates.includes(a); const rightAccepts = right.acceptingStates.includes(b); return operator === 'AND' ? leftAccepts && rightAccepts : leftAccepts || rightAccepts; });
  return { states, alphabet: left.alphabet, transitions, startState: stateName(left.startState, right.startState), acceptingStates: accepts, metadata: { combinedWith: operator, rules: [left.metadata, right.metadata] } };
}
/** Combines flat conditions with conventional AND-before-OR precedence. */
export function combineRuleAutomata(automata, operators) {
  if (!automata.length) throw new Error('At least one rule automaton is required.');
  const orBranches = []; let branch = automata[0];
  for (let index = 1; index < automata.length; index += 1) {
    if ((operators[index - 1] ?? 'AND') === 'OR') { orBranches.push(branch); branch = automata[index]; }
    else branch = combineAutomata(branch, automata[index], 'AND');
  }
  orBranches.push(branch);
  return orBranches.reduce((result, next) => combineAutomata(result, next, 'OR'));
}
