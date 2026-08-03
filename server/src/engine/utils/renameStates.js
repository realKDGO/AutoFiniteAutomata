function alphabetName(index) { let name = ''; let value = index; do { name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26) - 1; } while (value >= 0); return name; }
function nameFor(index, style) { if (style === 'alphabet') return alphabetName(index); if (style === 'number') return String(index); return `q${index}`; }
/** Relabels an already-generated automaton without changing its language. */
export function renameStates(automaton, style = 'q') {
  const mapping = Object.fromEntries(automaton.states.map((state, index) => [state, nameFor(index, style)]));
  const renameTarget = target => Array.isArray(target) ? target.map(item => mapping[item]) : mapping[target];
  return { ...automaton, states: automaton.states.map(state => mapping[state]), startState: mapping[automaton.startState], acceptingStates: automaton.acceptingStates.map(state => mapping[state]), transitions: Object.fromEntries(automaton.states.map(state => [mapping[state], Object.fromEntries(Object.entries(automaton.transitions[state]).map(([symbol, target]) => [symbol, renameTarget(target)]))])) };
}