import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRules } from '../src/engine/parsers/parseRules.js';
import { buildPrefixAutomaton, buildSuffixAutomaton, buildSubstringAutomaton } from '../src/engine/builders/patternBuilders.js';
import { combineAutomata } from '../src/engine/combiners/combineAutomata.js';
import { generateTransitionTable } from '../src/engine/generators/generateTransitionTable.js';
import { simulateInput } from '../src/engine/simulation/simulateInput.js';
import { renameStates } from '../src/engine/utils/renameStates.js';
import { createGeneration } from '../src/services/generationService.js';
const alphabet = ['0', '1'];
test('parser converts conditions into a rule AST', () => assert.deepEqual(parseRules([{ type: 'startsWith', value: '10' }, { operator: 'OR' }, { type: 'contains', value: '11' }]).map(rule => [rule.kind, rule.join]), [['prefix', null], ['substring', 'OR']]));
test('prefix builder accepts exactly the required initial prefix', () => { const a = buildPrefixAutomaton({ alphabet, value: '10' }); assert.equal(simulateInput(a, '101').accepted, true); assert.equal(simulateInput(a, '010').accepted, false); });
test('suffix builder only accepts an ending match', () => { const a = buildSuffixAutomaton({ alphabet, value: '01' }); assert.equal(simulateInput(a, '1001').accepted, true); assert.equal(simulateInput(a, '010').accepted, false); });
test('substring builder finds a match anywhere', () => { const a = buildSubstringAutomaton({ alphabet, value: '101' }); assert.equal(simulateInput(a, '01010').accepted, true); assert.equal(simulateInput(a, '111').accepted, false); });
test('AND and OR combiners respectively intersect and union', () => { const prefix = buildPrefixAutomaton({ alphabet, value: '1' }); const suffix = buildSuffixAutomaton({ alphabet, value: '0' }); assert.equal(simulateInput(combineAutomata(prefix, suffix, 'AND'), '10').accepted, true); assert.equal(simulateInput(combineAutomata(prefix, suffix, 'AND'), '11').accepted, false); assert.equal(simulateInput(combineAutomata(prefix, suffix, 'OR'), '11').accepted, true); });
test('transition table retains a complete structured representation', () => { const a = buildPrefixAutomaton({ alphabet, value: '1' }); const table = generateTransitionTable(a); assert.equal(table.transitions[table.startState]['1'], 'p1'); assert.deepEqual(table.alphabet, alphabet); });
test('simulation returns every traversal step', () => { const a = buildPrefixAutomaton({ alphabet, value: '10' }); const result = simulateInput(a, '101'); assert.equal(result.steps.length, 3); assert.equal(result.accepted, true); });
test('state renaming supports q, alphabet, and number styles', () => { const a = buildPrefixAutomaton({ alphabet, value: '1' }); assert.deepEqual(renameStates(a, 'q').states, ['q0', 'q1', 'q2']); assert.deepEqual(renameStates(a, 'alphabet').states, ['A', 'B', 'C']); assert.deepEqual(renameStates(a, 'number').states, ['0', '1', '2']); });
test('length conditions handle equality, bounds, and parity', () => {
  const equal = createGeneration({ kind: 'dfa', alphabet, conditions: [{ type: 'lengthEqual', count: 2 }] }).automaton;
  const even = createGeneration({ kind: 'dfa', alphabet, conditions: [{ type: 'evenLength' }] }).automaton;
  assert.equal(simulateInput(equal, '01').accepted, true); assert.equal(simulateInput(equal, '010').accepted, false); assert.equal(simulateInput(even, '01').accepted, true);
});
test('position and counting conditions enforce their requested symbol', () => {
  const position = createGeneration({ kind: 'dfa', alphabet, conditions: [{ type: 'nthSymbolNot', position: 2, symbol: '1' }] }).automaton;
  const count = createGeneration({ kind: 'dfa', alphabet, conditions: [{ type: 'exactOccurrences', count: 2, symbol: '1' }] }).automaton;
  assert.equal(simulateInput(position, '00').accepted, true); assert.equal(simulateInput(position, '01').accepted, false); assert.equal(simulateInput(count, '101').accepted, true);
});
test('negated patterns and composed expansion rules remain valid', () => {
  const generated = createGeneration({ kind: 'dfa', alphabet, conditions: [{ type: 'doesNotContain', value: '11' }, { operator: 'AND' }, { type: 'oddLength' }] }).automaton;
  assert.equal(simulateInput(generated, '010').accepted, true); assert.equal(simulateInput(generated, '011').accepted, false);
});
test('expanded-condition validation rejects invalid position and count values', () => {
  assert.throws(() => createGeneration({ kind: 'dfa', alphabet, conditions: [{ type: 'nthSymbol', position: 0, symbol: '1' }] }), /position greater than zero/);
  assert.throws(() => createGeneration({ kind: 'dfa', alphabet, conditions: [{ type: 'exactOccurrences', count: -1, symbol: '1' }] }), /non-negative occurrence count/);
});
