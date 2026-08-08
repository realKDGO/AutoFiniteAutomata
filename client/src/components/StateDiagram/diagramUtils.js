const NODE_RADIUS = 32;
const MAIN_Y = 175;
const X_GAP = 190;

export function collectDeadStates(automaton) {
  if (automaton.deadStates?.length) return new Set(automaton.deadStates);
  const accepting = new Set(automaton.acceptingStates ?? automaton.acceptStates ?? []);
  return new Set(automaton.states.filter(state => !accepting.has(state) && automaton.alphabet.every(symbol => {
    const target = automaton.transitions[state]?.[symbol];
    return (Array.isArray(target) ? target : [target]).every(item => item === state);
  })));
}

export function groupTransitions(automaton) {
  const groups = new Map();
  for (const from of automaton.states) for (const [symbol, rawTargets] of Object.entries(automaton.transitions[from] ?? {})) for (const to of Array.isArray(rawTargets) ? rawTargets : [rawTargets]) {
    if (!to) continue; const key = `${from}\u0000${to}`;
    if (!groups.has(key)) groups.set(key, { key, from, to, labels: [] });
    groups.get(key).labels.push(symbol === 'epsilon' ? 'epsilon' : symbol);
  }
  return [...groups.values()].map(edge => ({ ...edge, labels: [...new Set(edge.labels)], label: [...new Set(edge.labels)].join(', ') }));
}

function primaryOrder(automaton, deadStates) {
  const edges = groupTransitions(automaton); const seen = new Set(); const order = []; const queue = [automaton.startState];
  while (queue.length) { const state = queue.shift(); if (seen.has(state) || deadStates.has(state)) continue; seen.add(state); order.push(state); edges.filter(edge => edge.from === state && edge.to !== state && !deadStates.has(edge.to)).sort((a, b) => automaton.states.indexOf(a.to) - automaton.states.indexOf(b.to)).forEach(edge => { if (!seen.has(edge.to)) queue.push(edge.to); }); }
  automaton.states.forEach(state => { if (!deadStates.has(state) && !seen.has(state)) order.push(state); });
  return order;
}

export function layoutStates(automaton, deadStates = collectDeadStates(automaton)) {
  const primary = primaryOrder(automaton, deadStates); const edges = groupTransitions(automaton); const positions = {}; const index = new Map(primary.map((state, i) => [state, i]));
  primary.forEach((state, i) => { positions[state] = { x: 115 + i * X_GAP, y: MAIN_Y, row: 'main', index: i }; });
  const incoming = new Map([...deadStates].map(state => [state, []])); edges.forEach(edge => { if (deadStates.has(edge.to) && edge.from !== edge.to && !deadStates.has(edge.from)) incoming.get(edge.to)?.push(edge.from); });
  let extraDead = primary.length;
  [...deadStates].forEach((state, deadIndex) => { const sources = incoming.get(state) ?? []; const sourceIndexes = sources.map(source => index.get(source)).filter(Number.isInteger); const owner = sourceIndexes.length ? Math.round(sourceIndexes.reduce((sum, value) => sum + value, 0) / sourceIndexes.length) : extraDead++; positions[state] = { x: 115 + owner * X_GAP, y: 360 + Math.floor(deadIndex / Math.max(1, primary.length)) * 125, row: 'dead', index: owner }; });
  const maxDeadRow = Math.max(0, ...[...deadStates].map(state => Math.floor((positions[state].y - 360) / 125)));
  return { positions, width: Math.max(460, 210 + Math.max(primary.length, 1) * X_GAP), height: Math.max(310, 455 + maxDeadRow * 125), primary };
}

function boundaryPoint(from, to) { const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.hypot(dx, dy) || 1; return { start: { x: from.x + dx / length * NODE_RADIUS, y: from.y + dy / length * NODE_RADIUS }, end: { x: to.x - dx / length * NODE_RADIUS, y: to.y - dy / length * NODE_RADIUS } }; }
export function edgeGeometry(edge, positions, edges) {
  const source = positions[edge.from]; const target = positions[edge.to]; const forward = target.index > source.index;
  if (edge.from === edge.to) return { path: `M ${source.x - 16} ${source.y - NODE_RADIUS + 4} C ${source.x - 64} ${source.y - 104}, ${source.x + 64} ${source.y - 104}, ${source.x + 16} ${source.y - NODE_RADIUS + 4}`, label: { x: source.x, y: source.y - 96 } };
  const { start, end } = boundaryPoint(source, target);
  if (target.row === 'dead' && source.row === 'main') { const bendY = source.y + 82; return { path: `M ${start.x} ${start.y} Q ${source.x} ${bendY} ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2 + 16, y: bendY - 7 } }; }
  if (source.row === 'dead' || target.row === 'dead') { const bendY = Math.max(source.y, target.y) + 70; return { path: `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${bendY} ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: bendY + 14 } }; }
  const span = Math.abs(target.index - source.index); const reverse = edges.some(other => other.from === edge.to && other.to === edge.from);
  if (forward && span === 1 && !reverse) return { path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: source.y - 13 } };
  const lane = 78 + Math.max(0, span - 1) * 34 + (reverse && forward ? 28 : 0); const channelY = MAIN_Y - lane;
  return { path: `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${channelY} ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: channelY - 9 } };
}

export function simulationHighlights(automaton, simulation) { if (!simulation) return { states: new Set(), edges: new Set() }; const states = new Set([automaton.startState]); const edges = new Set(); let previous = new Set([automaton.startState]); for (const step of simulation.steps ?? []) { const next = new Set(step.states ?? []); next.forEach(state => states.add(state)); for (const from of previous) for (const to of next) edges.add(`${from}\u0000${to}\u0000${step.symbol}`); previous = next; } return { states, edges }; }