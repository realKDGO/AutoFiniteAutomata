function make({ alphabet, states, transitions, startState, acceptingStates, metadata }) {
  return { states, alphabet, transitions, startState: startState ?? states[0], acceptingStates, metadata };
}

export function buildNthSymbolAutomaton({ alphabet, position, symbol, negate = false }) {
  const pos = Math.max(1, Number(position) || 1);
  const states = Array.from({ length: pos }, (_, index) => `n${index}`);
  states.push('accept', 'reject');
  const transitions = {};
  for (let index = 0; index < pos; index += 1) {
    transitions[`n${index}`] = Object.fromEntries(
      alphabet.map(current => [
        current,
        index === pos - 1 ? ((current === symbol) !== negate ? 'accept' : 'reject') : `n${index + 1}`,
      ])
    );
  }
  transitions.accept = Object.fromEntries(alphabet.map(s => [s, 'accept']));
  transitions.reject = Object.fromEntries(alphabet.map(s => [s, 'reject']));
  return make({
    alphabet,
    states,
    transitions,
    acceptingStates: ['accept'],
    metadata: { mode: negate ? 'nthSymbolNot' : 'nthSymbol', position: pos, symbol },
  });
}

export const buildFirstSymbolAutomaton = ({ alphabet, symbol }) =>
  buildNthSymbolAutomaton({ alphabet, position: 1, symbol });

export const buildLastSymbolAutomaton = ({ alphabet, symbol }) => {
  const transitions = { start: {}, accept: {}, reject: {} };
  for (const current of alphabet) {
    transitions.start[current] = current === symbol ? 'accept' : 'reject';
    transitions.accept[current] = current === symbol ? 'accept' : 'reject';
    transitions.reject[current] = current === symbol ? 'accept' : 'reject';
  }
  return make({
    alphabet,
    states: ['start', 'accept', 'reject'],
    transitions,
    acceptingStates: ['accept'],
    metadata: { mode: 'lastSymbol', symbol },
  });
};

export function buildNthToLastSymbolAutomaton({ alphabet, position = 2, symbol, negate = false }) {
  const pos = Math.max(1, Number(position) || 2);
  const statesSet = new Set(['']);
  const queue = [''];

  while (queue.length > 0) {
    const current = queue.shift();
    for (const char of alphabet) {
      const next = current.length < pos ? current + char : current.slice(1) + char;
      if (!statesSet.has(next)) {
        statesSet.add(next);
        queue.push(next);
      }
    }
  }

  const states = Array.from(statesSet);
  const transitions = {};

  for (const s of states) {
    transitions[s] = {};
    for (const char of alphabet) {
      transitions[s][char] = s.length < pos ? s + char : s.slice(1) + char;
    }
  }

  const acceptingStates = states.filter(s => {
    if (s.length < pos) return false;
    const targetChar = s[0];
    return negate ? targetChar !== symbol : targetChar === symbol;
  });

  return make({
    alphabet,
    states,
    transitions,
    startState: '',
    acceptingStates,
    metadata: {
      mode: negate ? 'nthToLastSymbolNot' : 'nthToLastSymbol',
      position: pos,
      symbol,
    },
  });
}

export const buildSecondToLastSymbolAutomaton = ({ alphabet, symbol }) =>
  buildNthToLastSymbolAutomaton({ alphabet, position: 2, symbol });