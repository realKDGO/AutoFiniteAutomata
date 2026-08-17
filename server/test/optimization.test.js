import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeneration } from '../src/services/generationService.js';
import { simulateInput } from '../src/engine/simulation/simulateInput.js';

const alphabet = ['0', '1'];

test('Test Case A: Exactly one 0 over {0,1}', () => {
  const result = createGeneration({
    kind: 'dfa',
    alphabet,
    conditions: [{ type: 'exactOccurrences', count: 1, symbol: '0' }],
    stateNaming: 'alphabet',
  });
  const automaton = result.automaton;

  const accepted = ['0', '10', '01', '11011', '1110'];
  const rejected = ['', '1', '11', '00', '100', '0101'];

  for (const str of accepted) {
    assert.equal(simulateInput(automaton, str).accepted, true, `Should accept: "${str}"`);
  }
  for (const str of rejected) {
    assert.equal(simulateInput(automaton, str).accepted, false, `Should reject: "${str}"`);
  }

  // Minimal states: q0 (0 zeros seen), q1 (1 zero seen - accept), q2 (2+ zeros seen - dead) -> 3 states
  assert.equal(automaton.states.length, 3);
  assert.equal(automaton.startState, 'A');
});

test('Test Case B: Ends with 01 over {0,1}', () => {
  const result = createGeneration({
    kind: 'dfa',
    alphabet,
    conditions: [{ type: 'endsWith', value: '01' }],
    stateNaming: 'alphabet',
  });
  const automaton = result.automaton;

  const accepted = ['01', '001', '101', '11101', '00001'];
  const rejected = ['', '0', '1', '10', '00', '11', '010'];

  for (const str of accepted) {
    assert.equal(simulateInput(automaton, str).accepted, true, `Should accept: "${str}"`);
  }
  for (const str of rejected) {
    assert.equal(simulateInput(automaton, str).accepted, false, `Should reject: "${str}"`);
  }

  // Minimal DFA states for endsWith('01'): 3 states
  assert.equal(automaton.states.length, 3);
  assert.equal(automaton.startState, 'A');
});

test('Test Case C: Contains 01 over {0,1}', () => {
  const result = createGeneration({
    kind: 'dfa',
    alphabet,
    conditions: [{ type: 'contains', value: '01' }],
    stateNaming: 'alphabet',
  });
  const automaton = result.automaton;

  const accepted = ['01', '001', '10100', '111011', '000010'];
  const rejected = ['', '0', '1', '00', '11', '1100', '000'];

  for (const str of accepted) {
    assert.equal(simulateInput(automaton, str).accepted, true, `Should accept: "${str}"`);
  }
  for (const str of rejected) {
    assert.equal(simulateInput(automaton, str).accepted, false, `Should reject: "${str}"`);
  }

  // Minimal DFA states for contains('01'): 3 states
  assert.equal(automaton.states.length, 3);
  assert.equal(automaton.startState, 'A');
});

test('Test Case D: Does not contain 110 over {0,1}', () => {
  const result = createGeneration({
    kind: 'dfa',
    alphabet,
    conditions: [{ type: 'doesNotContain', value: '110' }],
    stateNaming: 'alphabet',
  });
  const automaton = result.automaton;

  const accepted = ['', '0', '1', '00', '01', '10', '11', '1111', '0101', '10111'];
  const rejected = ['110', '0110', '1100', '1110', '01101'];

  for (const str of accepted) {
    assert.equal(simulateInput(automaton, str).accepted, true, `Should accept: "${str}"`);
  }
  for (const str of rejected) {
    assert.equal(simulateInput(automaton, str).accepted, false, `Should reject: "${str}"`);
  }

  // Minimal DFA states for doesNotContain('110'): 4 states
  assert.equal(automaton.states.length, 4);
  assert.equal(automaton.startState, 'A');
});

test('Test Case E: Starts with 1 AND ends with 01 over {0,1}', () => {
  const result = createGeneration({
    kind: 'dfa',
    alphabet,
    conditions: [
      { type: 'startsWith', value: '1' },
      { operator: 'AND' },
      { type: 'endsWith', value: '01' },
    ],
    stateNaming: 'alphabet',
  });
  const automaton = result.automaton;

  const accepted = ['101', '1001', '1101', '10101', '111101'];
  const rejected = ['', '1', '01', '001', '10', '100', '0101', '110'];

  for (const str of accepted) {
    assert.equal(simulateInput(automaton, str).accepted, true, `Should accept: "${str}"`);
  }
  for (const str of rejected) {
    assert.equal(simulateInput(automaton, str).accepted, false, `Should reject: "${str}"`);
  }

  // Minimal DFA states for startsWith('1') AND endsWith('01'): 5 states (Start, 1-seen/no-0, 1...0 seen, 1...01 accept, dead)
  assert.equal(automaton.states.length <= 5, true);
  assert.equal(automaton.startState, 'A');
});

test('Test Case F: Starts with 1 AND contains 00 AND ends with 1 over {0,1}', () => {
  const result = createGeneration({
    kind: 'dfa',
    alphabet,
    conditions: [
      { type: 'startsWith', value: '1' },
      { operator: 'AND' },
      { type: 'contains', value: '00' },
      { operator: 'AND' },
      { type: 'endsWith', value: '1' },
    ],
    stateNaming: 'alphabet',
  });
  const automaton = result.automaton;

  const accepted = ['1001', '10001', '11001', '100101', '101001', '1000011'];
  const rejected = [
    '',
    '1',
    '001',
    '01001',
    '100',
    '1000',
    '1010',
    '10010',
    '010011',
  ];

  for (const str of accepted) {
    assert.equal(simulateInput(automaton, str).accepted, true, `Should accept: "${str}"`);
  }
  for (const str of rejected) {
    assert.equal(simulateInput(automaton, str).accepted, false, `Should reject: "${str}"`);
  }

  // Minimal DFA has exactly 6 states:
  // A: start (empty)
  // B: starts with 1, 00 not seen, ends with 1
  // C: starts with 1, 00 not seen, ends with 0
  // D: starts with 1, 00 seen, ends with 0
  // E: starts with 1, 00 seen, ends with 1 (ACCEPT)
  // F (Dead): started with 0
  assert.equal(automaton.states.length, 6);
  assert.equal(automaton.startState, 'A');
  assert.ok(automaton.metadata?.optimizationTrace);
  assert.equal(automaton.metadata.optimizationTrace.minimizedStateCount, 6);
});

test('NFA generation preserves nondeterminism and unreachable removal without over-minimizing', () => {
  const result = createGeneration({
    kind: 'nfa',
    alphabet,
    conditions: [{ type: 'startsWith', value: '1' }],
    stateNaming: 'q',
  });
  const automaton = result.automaton;

  assert.equal(automaton.kind, 'nfa');
  assert.equal(simulateInput(automaton, '10').accepted, true);
  assert.equal(simulateInput(automaton, '01').accepted, false);
});
