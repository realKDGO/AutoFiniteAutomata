function longestPrefixSuffix(pattern, candidate) { for (let length = Math.min(pattern.length, candidate.length); length >= 0; length -= 1) if (candidate.endsWith(pattern.slice(0, length))) return length; return 0; }
function makePatternAutomaton({ alphabet, pattern, mode }) {
  const stateCount = pattern.length + 1; const states = Array.from({ length: stateCount }, (_, i) => `p${i}`); const transitions = {};
  for (let progress = 0; progress < stateCount; progress += 1) { transitions[states[progress]] = {}; for (const symbol of alphabet) {
    if (mode === 'prefix') { const next = progress === pattern.length ? progress : (symbol === pattern[progress] ? progress + 1 : stateCount); transitions[states[progress]][symbol] = next === stateCount ? 'dead' : states[next]; }
    else if (mode === 'substring' && progress === pattern.length) transitions[states[progress]][symbol] = states[progress];
    else { const candidate = pattern.slice(0, progress) + symbol; transitions[states[progress]][symbol] = states[longestPrefixSuffix(pattern, candidate)]; }
  }}
  if (mode === 'prefix') { states.push('dead'); transitions.dead = Object.fromEntries(alphabet.map(symbol => [symbol, 'dead'])); }
  return { states, alphabet, transitions, startState: 'p0', acceptingStates: [`p${pattern.length}`], metadata: { mode, pattern } };
}
export const buildPrefixAutomaton = ({ alphabet, value }) => makePatternAutomaton({ alphabet, pattern: value, mode: 'prefix' });
export const buildSuffixAutomaton = ({ alphabet, value }) => makePatternAutomaton({ alphabet, pattern: value, mode: 'suffix' });
export const buildSubstringAutomaton = ({ alphabet, value }) => makePatternAutomaton({ alphabet, pattern: value, mode: 'substring' });