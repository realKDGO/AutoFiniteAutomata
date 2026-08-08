import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeneration } from '../src/services/generationService.js';
import { convertNfaToDfa } from '../src/engine/optimization/convertNfaToDfa.js';
import { simulateInput } from '../src/engine/simulation/simulateInput.js';

const alphabet = ['0', '1'];

function generateTestStrings(symbols, maxLength) {
  const result = [''];
  for (let len = 1; len <= maxLength; len++) {
    const prev = result.filter(s => s.length === len - 1);
    for (const p of prev) {
      for (const sym of symbols) {
        result.push(p + sym);
      }
    }
  }
  return result;
}

test('NFA Generation omits explicit dead states (Requirement 17A)', () => {
  const nfaResult = createGeneration({
    kind: 'nfa',
    alphabet,
    conditions: [{ type: 'contains', value: '101' }],
  });
  const nfa = nfaResult.automaton;

  assert.equal(nfa.kind, 'nfa');
  // Check that no state is named "dead" or contains explicit dead self-loops
  assert.ok(!nfa.states.includes('dead'));
  assert.ok(!nfa.states.includes('Dead'));
});

test('NFA to DFA Subset Construction produces equivalent DFA', () => {
  const nfaResult = createGeneration({
    kind: 'nfa',
    alphabet,
    conditions: [{ type: 'contains', value: '101' }],
  });
  const nfa = nfaResult.automaton;

  const conversion = convertNfaToDfa(nfa, { stateNaming: 'alphabet' });
  const dfa = conversion.convertedDfa;

  assert.equal(dfa.kind, 'dfa');
  assert.ok(conversion.conversionSteps.length > 0);

  // Test equivalence for all strings up to length 5
  const testStrings = generateTestStrings(alphabet, 5);

  for (const str of testStrings) {
    const nfaRes = simulateInput(nfa, str);
    const dfaRes = simulateInput(dfa, str);
    assert.equal(
      nfaRes.accepted,
      dfaRes.accepted,
      `Result mismatch for string "${str}": NFA=${nfaRes.accepted}, DFA=${dfaRes.accepted}`
    );
  }
});

test('Subset Construction handles empty set / dead state properly', () => {
  const nfaResult = createGeneration({
    kind: 'nfa',
    alphabet,
    conditions: [{ type: 'startsWith', value: '1' }],
  });
  const nfa = nfaResult.automaton;

  const conversion = convertNfaToDfa(nfa, { stateNaming: 'alphabet' });
  const dfa = conversion.convertedDfa;

  // Reading '0' from start state in startsWith('1') produces empty set ∅ in DFA
  assert.equal(simulateInput(dfa, '10').accepted, true);
  assert.equal(simulateInput(dfa, '01').accepted, false);
});
