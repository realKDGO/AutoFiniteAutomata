function epsilonClosure(automaton, initial) { const closure = new Set(initial); const stack = [...closure]; while (stack.length) for (const state of automaton.transitions[stack.pop()]?.epsilon ?? []) if (!closure.has(state)) { closure.add(state); stack.push(state); } return closure; }
/** Simulates both transition formats: scalar DFA targets and NFA target arrays. */
export function simulateInput(automaton, input) {
 const symbols = Array.from(input ?? ''); const invalid = symbols.find(symbol => !automaton.alphabet.includes(symbol)); if (invalid) { const error = new Error(`Input contains "${invalid}", which is not in the alphabet.`); error.statusCode = 400; error.expose = true; throw error; }
 let current = epsilonClosure(automaton, [automaton.startState]); const steps = [];
 for (const symbol of symbols) { const next = new Set(); for (const state of current) { const targets = automaton.transitions[state]?.[symbol] ?? []; for (const target of Array.isArray(targets) ? targets : [targets]) if (target) next.add(target); } current = epsilonClosure(automaton, next); steps.push({ symbol, states: [...current] }); }
 const finalStates = [...current]; return { input, steps, finalStates, accepted: finalStates.some(state => automaton.acceptingStates.includes(state)) };
}