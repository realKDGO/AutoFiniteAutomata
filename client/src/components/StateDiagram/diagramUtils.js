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
function loopSide(edge, positions, edges) {
  const point = positions[edge.from]; const score = { top: 0, right: 0, bottom: 0, left: 0 }; const incident = edges.filter(other => other.key !== edge.key && (other.from === edge.from || other.to === edge.from));
  for (const other of incident) { const otherState = other.from === edge.from ? other.to : other.from; const target = positions[otherState]; if (!target) continue; const dx = target.x - point.x; const dy = target.y - point.y; if (Math.abs(dx) > Math.abs(dy)) score[dx > 0 ? 'right' : 'left'] += 4; else score[dy > 0 ? 'bottom' : 'top'] += 5; }
  // Loops on a dead-state branch avoid the vertical incoming route above.
  if (point.row === 'dead') score.top += 8;
  return Object.entries(score).sort((a, b) => a[1] - b[1] || ['top', 'right', 'bottom', 'left'].indexOf(a[0]) - ['top', 'right', 'bottom', 'left'].indexOf(b[0]))[0][0];
}
function selfLoopGeometry(edge, positions, edges) { const point = positions[edge.from]; const side = loopSide(edge, positions, edges); const r = NODE_RADIUS; if (side === 'right') return { path: `M ${point.x + r - 4} ${point.y - 15} C ${point.x + 102} ${point.y - 62}, ${point.x + 102} ${point.y + 62}, ${point.x + r - 4} ${point.y + 15}`, label: { x: point.x + 94, y: point.y } }; if (side === 'bottom') return { path: `M ${point.x - 16} ${point.y + r - 4} C ${point.x - 64} ${point.y + 102}, ${point.x + 64} ${point.y + 102}, ${point.x + 16} ${point.y + r - 4}`, label: { x: point.x, y: point.y + 96 } }; if (side === 'left') return { path: `M ${point.x - r + 4} ${point.y + 15} C ${point.x - 102} ${point.y + 62}, ${point.x - 102} ${point.y - 62}, ${point.x - r + 4} ${point.y - 15}`, label: { x: point.x - 94, y: point.y } }; return { path: `M ${point.x - 16} ${point.y - r + 4} C ${point.x - 64} ${point.y - 102}, ${point.x + 64} ${point.y - 102}, ${point.x + 16} ${point.y - r + 4}`, label: { x: point.x, y: point.y - 96 } }; }
export function edgeGeometry(edge, positions, edges) { const source = positions[edge.from]; const target = positions[edge.to]; const forward = target.index > source.index; if (edge.from === edge.to) return selfLoopGeometry(edge, positions, edges); const { start, end } = boundaryPoint(source, target); if (target.row === 'dead' && source.row === 'main') { const bendY = source.y + 86; const direction = end.x >= start.x ? 16 : -16; return { path: `M ${start.x} ${start.y} Q ${source.x + direction} ${bendY} ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2 + direction * 2, y: bendY - 12 } }; } if (source.row === 'dead' || target.row === 'dead') { const bendY = Math.max(source.y, target.y) + 74; return { path: `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${bendY} ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: bendY + 14 } }; } const span = Math.abs(target.index - source.index); const reverse = edges.some(other => other.from === edge.to && other.to === edge.from); if (forward && span === 1 && !reverse) return { path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: source.y - 15 } }; const lane = 82 + Math.max(0, span - 1) * 38 + (reverse && forward ? 28 : 0); const channelY = MAIN_Y - lane; return { path: `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${channelY} ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: channelY - 11 } }; }
function box(point, label) { const width = Math.max(34, label.length * 7.2); return { x: point.x - width / 2, y: point.y - 12, width, height: 18 }; }
export function labelIntersectsLabel(a, b) { return a.x < b.x + b.width + 7 && a.x + a.width + 7 > b.x && a.y < b.y + b.height + 5 && a.y + a.height + 5 > b.y; }
function orientation(a, b, c) { return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)); }
export function edgeIntersectsEdge(a, b, c, d) { const o1 = orientation(a, b, c); const o2 = orientation(a, b, d); const o3 = orientation(c, d, a); const o4 = orientation(c, d, b); return o1 !== o2 && o3 !== o4; }
export function edgeIntersectsState(start, end, state, radius = NODE_RADIUS + 8) { const dx = end.x - start.x; const dy = end.y - start.y; const lengthSquared = dx * dx + dy * dy || 1; const projection = Math.max(0, Math.min(1, ((state.x - start.x) * dx + (state.y - start.y) * dy) / lengthSquared)); const closest = { x: start.x + projection * dx, y: start.y + projection * dy }; return Math.hypot(state.x - closest.x, state.y - closest.y) < radius; }
export function routeEdges(edges, positions) { const occupied = []; return edges.map(edge => { const geometry = edgeGeometry(edge, positions, edges); const adjusted = { ...geometry, label: { ...geometry.label } }; let candidate = box(adjusted.label, edge.label); let attempts = 0; while (occupied.some(existing => labelIntersectsLabel(candidate, existing)) && attempts < 8) { adjusted.label.y += edge.from === edge.to || positions[edge.to].row === 'dead' ? 20 : -20; candidate = box(adjusted.label, edge.label); attempts += 1; } occupied.push(candidate); return { edge, geometry: adjusted }; }); }
export function simulationHighlights(automaton, simulation) { if (!simulation) return { states: new Set(), edges: new Set() }; const states = new Set([automaton.startState]); const edges = new Set(); let previous = new Set([automaton.startState]); for (const step of simulation.steps ?? []) { const next = new Set(step.states ?? []); next.forEach(state => states.add(state)); for (const from of previous) for (const to of next) edges.add(`${from}\u0000${to}\u0000${step.symbol}`); previous = next; } return { states, edges }; }
