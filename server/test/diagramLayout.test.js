import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDeadStates,
  groupTransitions,
  layoutStates,
  loopSide,
  edgeGeometry,
  routeEdges,
  simulationHighlights,
} from '../../client/src/components/StateDiagram/diagramUtils.js';
import { createBuilderAutomatonFromGenerated } from '../../client/src/builder/automatonStorage.js';

test('1. Simple DFA with 2 states produces valid layout and positions', () => {
  const dfa = {
    kind: 'dfa',
    alphabet: ['0', '1'],
    states: ['A', 'B'],
    startState: 'A',
    acceptingStates: ['B'],
    transitions: {
      A: { '0': 'A', '1': 'B' },
      B: { '0': 'B', '1': 'A' },
    },
  };
  const layout = layoutStates(dfa);
  assert.equal(layout.strategy, 'linear');
  assert.ok(layout.positions['A'].x < layout.positions['B'].x);
  assert.equal(layout.positions['A'].y, layout.positions['B'].y);
  assert.ok(layout.width >= 460);
  assert.ok(layout.height >= 280);
});

test('2. DFA with sequential states places states in topological order', () => {
  const dfa = {
    kind: 'dfa',
    alphabet: ['0', '1'],
    states: ['q0', 'q1', 'q2', 'q3'],
    startState: 'q0',
    acceptingStates: ['q3'],
    transitions: {
      q0: { '0': 'q0', '1': 'q1' },
      q1: { '0': 'q2', '1': 'q1' },
      q2: { '0': 'q2', '1': 'q3' },
      q3: { '0': 'q3', '1': 'q3' },
    },
  };
  const layout = layoutStates(dfa);
  const pos0 = layout.positions['q0'];
  const pos1 = layout.positions['q1'];
  const pos2 = layout.positions['q2'];
  const pos3 = layout.positions['q3'];
  assert.ok(pos0.x < pos1.x);
  assert.ok(pos1.x < pos2.x);
  assert.ok(pos2.x < pos3.x);
});

test('3. NFA with multiple branches arranges branching states cleanly', () => {
  const nfa = {
    kind: 'nfa',
    alphabet: ['a', 'b'],
    states: ['S', 'A1', 'A2', 'B1', 'B2', 'F'],
    startState: 'S',
    acceptingStates: ['F'],
    transitions: {
      S: { a: ['A1', 'A2'], b: [] },
      A1: { b: ['B1'] },
      A2: { b: ['B2'] },
      B1: { a: ['F'] },
      B2: { a: ['F'] },
      F: {},
    },
  };
  const layout = layoutStates(nfa);
  assert.ok(layout.positions['S']);
  assert.ok(layout.positions['F']);
  assert.ok(layout.positions['F'].x > layout.positions['S'].x);
});

test('4. Self-loop on start state avoids left side (avoids start arrow collision)', () => {
  const dfa = {
    kind: 'dfa',
    alphabet: ['0', '1'],
    states: ['A', 'B'],
    startState: 'A',
    acceptingStates: ['B'],
    transitions: {
      A: { '0': 'A', '1': 'B' },
      B: { '0': 'B', '1': 'B' },
    },
  };
  const layout = layoutStates(dfa);
  const edges = groupTransitions(dfa);
  const loopEdgeA = edges.find(e => e.from === 'A' && e.to === 'A');
  const sideA = loopSide(loopEdgeA, layout.positions, edges, dfa.startState);
  assert.notEqual(sideA, 'left', 'Start state self-loop should not be on left where start arrow enters');
});

test('5. Multiple transitions on same pair are combined cleanly', () => {
  const dfa = {
    kind: 'dfa',
    alphabet: ['0', '1'],
    states: ['A', 'B'],
    startState: 'A',
    acceptingStates: ['B'],
    transitions: {
      A: { '0': 'B', '1': 'B' },
      B: { '0': 'B', '1': 'B' },
    },
  };
  const edges = groupTransitions(dfa);
  const edgeAB = edges.find(e => e.from === 'A' && e.to === 'B');
  assert.ok(edgeAB);
  assert.equal(edgeAB.label, '0, 1');
  assert.deepEqual(edgeAB.labels, ['0', '1']);
});

test('6. Bidirectional transitions (A -> B and B -> A) are offset in opposite directions', () => {
  const dfa = {
    kind: 'dfa',
    alphabet: ['0', '1'],
    states: ['A', 'B'],
    startState: 'A',
    acceptingStates: ['B'],
    transitions: {
      A: { '0': 'A', '1': 'B' },
      B: { '0': 'A', '1': 'B' },
    },
  };
  const layout = layoutStates(dfa);
  const edges = groupTransitions(dfa);
  const edgeAB = edges.find(e => e.from === 'A' && e.to === 'B');
  const edgeBA = edges.find(e => e.from === 'B' && e.to === 'A');

  const geomAB = edgeGeometry(edgeAB, layout.positions, edges);
  const geomBA = edgeGeometry(edgeBA, layout.positions, edges);

  assert.ok(geomAB.path.includes('Q'), 'A->B should be a curved quadratic bezier');
  assert.ok(geomBA.path.includes('Q'), 'B->A should be a curved quadratic bezier');

  // One curves with positive offset and the other with negative offset
  const matchAB = geomAB.path.match(/Q\s+(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)/);
  const matchBA = geomBA.path.match(/Q\s+(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)/);
  assert.ok(matchAB && matchBA);
  const midY_AB = parseFloat(matchAB[3]);
  const midY_BA = parseFloat(matchBA[3]);
  assert.notEqual(midY_AB, midY_BA, 'Bidirectional curves must have different control points');
});

test('7. Multiple dead states are placed at distinct non-overlapping positions', () => {
  const dfa = {
    kind: 'dfa',
    alphabet: ['0', '1'],
    states: ['A', 'B', 'D1', 'D2'],
    startState: 'A',
    acceptingStates: ['B'],
    deadStates: ['D1', 'D2'],
    transitions: {
      A: { '0': 'D1', '1': 'B' },
      B: { '0': 'D2', '1': 'B' },
      D1: { '0': 'D1', '1': 'D1' },
      D2: { '0': 'D2', '1': 'D2' },
    },
  };
  const layout = layoutStates(dfa, new Set(dfa.deadStates));
  const posD1 = layout.positions['D1'];
  const posD2 = layout.positions['D2'];

  assert.equal(posD1.row, 'dead');
  assert.equal(posD2.row, 'dead');
  assert.notEqual(posD1.x, posD2.x, 'Multiple dead states must not share the exact same X position');
});

test('8. routeEdges avoids label collisions without throwing', () => {
  const dfa = {
    kind: 'dfa',
    alphabet: ['0', '1'],
    states: ['A', 'B', 'C'],
    startState: 'A',
    acceptingStates: ['C'],
    transitions: {
      A: { '0': 'B', '1': 'C' },
      B: { '0': 'C', '1': 'A' },
      C: { '0': 'A', '1': 'B' },
    },
  };
  const layout = layoutStates(dfa);
  const edges = groupTransitions(dfa);
  const routes = routeEdges(edges, layout);

  assert.equal(routes.length, edges.length);
  for (const r of routes) {
    assert.ok(Number.isFinite(r.geometry.label.x));
    assert.ok(Number.isFinite(r.geometry.label.y));
  }
});

test('9. Generator -> Builder handoff preserves automaton structure and custom positions', () => {
  const dfa = {
    kind: 'dfa',
    alphabet: ['0', '1'],
    states: ['A', 'B'],
    startState: 'A',
    acceptingStates: ['B'],
    transitions: {
      A: { '0': 'A', '1': 'B' },
      B: { '0': 'B', '1': 'A' },
    },
  };
  const layout = layoutStates(dfa);
  const edges = groupTransitions(dfa);
  const loopSides = { A: 'top', B: 'top' };

  const builderAutomaton = createBuilderAutomatonFromGenerated({
    automaton: dfa,
    deadStates: [],
    stateNaming: 'alphabet',
    positions: layout.positions,
    loopSides,
  });

  assert.ok(builderAutomaton);
  assert.equal(builderAutomaton.states.length, 2);
  assert.equal(builderAutomaton.states[0].name, 'A');
  assert.equal(builderAutomaton.states[0].initial, true);
  assert.equal(builderAutomaton.states[1].name, 'B');
  assert.equal(builderAutomaton.states[1].accepting, true);
  assert.equal(builderAutomaton.states[0].position.x, layout.positions['A'].x);
  assert.equal(builderAutomaton.states[0].position.y, layout.positions['A'].y);
});

test('10. Simulation highlights identify active states and traversed edges', () => {
  const dfa = {
    kind: 'dfa',
    alphabet: ['0', '1'],
    states: ['A', 'B'],
    startState: 'A',
    acceptingStates: ['B'],
    transitions: {
      A: { '0': 'A', '1': 'B' },
      B: { '0': 'B', '1': 'A' },
    },
  };
  const sim = {
    accepted: true,
    steps: [
      { symbol: '1', states: ['B'] },
      { symbol: '0', states: ['B'] },
    ],
  };
  const highlights = simulationHighlights(dfa, sim);
  assert.ok(highlights.states.has('A'));
  assert.ok(highlights.states.has('B'));
  assert.ok(highlights.edges.has('A\0B\x001'));
  assert.ok(highlights.edges.has('B\0B\x000'));
});
