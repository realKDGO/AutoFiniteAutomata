// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const NODE_RADIUS = 32;
const H_GAP = 190;   // horizontal gap between state centres in linear layout
const V_GAP = 160;   // vertical gap between rows in multi-row layouts
const MARGIN_X = 115;
const MARGIN_Y = 115;
const LOOP_OFFSET = 102; // distance from node centre to loop apex

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the set of dead states; falls back to structural detection. */
export function collectDeadStates(automaton) {
  if (automaton.deadStates?.length) return new Set(automaton.deadStates);
  const accepting = new Set(automaton.acceptingStates ?? automaton.acceptStates ?? []);
  return new Set(
    automaton.states.filter(
      state =>
        !accepting.has(state) &&
        automaton.alphabet.every(symbol => {
          const target = automaton.transitions[state]?.[symbol];
          return (Array.isArray(target) ? target : [target]).every(item => item === state);
        })
    )
  );
}

/**
 * Groups individual symbol transitions into a single edge per (from, to) pair,
 * combining their labels and handling null (missing NFA) transitions gracefully.
 */
export function groupTransitions(automaton) {
  const groups = new Map();
  for (const from of automaton.states) {
    for (const [symbol, rawTargets] of Object.entries(automaton.transitions[from] ?? {})) {
      // null means "no transition" in NFA representation — skip
      if (rawTargets === null || rawTargets === undefined) continue;
      const targets = Array.isArray(rawTargets) ? rawTargets : [rawTargets];
      for (const to of targets) {
        if (!to) continue;
        const key = `${from}\0${to}`;
        if (!groups.has(key)) groups.set(key, { key, from, to, labels: [] });
        groups.get(key).labels.push(symbol === 'epsilon' ? 'ε' : symbol);
      }
    }
  }
  return [...groups.values()].map(edge => ({
    ...edge,
    labels: [...new Set(edge.labels)],
    label: [...new Set(edge.labels)].join(', '),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

/** BFS from startState; returns states in discovery order (excluding dead states). */
function bfsOrder(automaton, deadStates, edges) {
  const seen = new Set();
  const order = [];
  const queue = [automaton.startState];
  while (queue.length) {
    const s = queue.shift();
    if (seen.has(s) || deadStates.has(s)) continue;
    seen.add(s);
    order.push(s);
    edges
      .filter(e => e.from === s && e.to !== s && !deadStates.has(e.to))
      .sort((a, b) => automaton.states.indexOf(a.to) - automaton.states.indexOf(b.to))
      .forEach(e => { if (!seen.has(e.to)) queue.push(e.to); });
  }
  automaton.states.forEach(s => { if (!deadStates.has(s) && !seen.has(s)) order.push(s); });
  return order;
}

/** Assign BFS-layer depth to each live state for layered layouts. */
function assignLayers(automaton, deadStates, edges) {
  const layers = new Map([[automaton.startState, 0]]);
  const queue = [automaton.startState];
  while (queue.length) {
    const s = queue.shift();
    for (const e of edges) {
      if (e.from !== s || e.from === e.to || deadStates.has(e.to)) continue;
      if (!layers.has(e.to)) {
        layers.set(e.to, layers.get(s) + 1);
        queue.push(e.to);
      }
    }
  }
  // Any unreached state gets placed at depth = max+1
  const maxDepth = Math.max(0, ...layers.values());
  for (const s of automaton.states) {
    if (!deadStates.has(s) && !layers.has(s)) layers.set(s, maxDepth + 1);
  }
  return layers;
}

/**
 * Counts crossing pairs between straight-line edges given a position map.
 * Uses a simple segment intersection test — sufficient as a layout score.
 */
function countLinearCrossings(order, edgeList) {
  let crossings = 0;
  // Build index map
  const idx = new Map(order.map((s, i) => [s, i]));
  const segments = edgeList
    .filter(e => e.from !== e.to && idx.has(e.from) && idx.has(e.to))
    .map(e => [idx.get(e.from), idx.get(e.to)]);
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const [a, b] = segments[i];
      const [c, d] = segments[j];
      // Crossing if intervals overlap in the opposite direction
      if ((a < c && b > d) || (a > c && b < d) || (a < d && b > c && a > c)) crossings++;
      if ((c < a && d > b) || (c > a && d < b) || (c < b && d > a && c > a)) crossings++;
    }
  }
  return crossings;
}

/**
 * Decision function: returns which layout strategy to use.
 * 'linear' | 'layered' | 'grid'
 */
function chooseLayout(liveStates, deadStates, edges) {
  const n = liveStates.length;
  if (n <= 4) return 'linear';

  const selfLoops = edges.filter(e => e.from === e.to).length;
  const biDirectional = edges.filter(e =>
    edges.some(other => other.from === e.to && other.to === e.from)
  ).length;
  const longEdgeCount = edges.filter(e => {
    const ai = liveStates.indexOf(e.from);
    const bi = liveStates.indexOf(e.to);
    return ai >= 0 && bi >= 0 && Math.abs(ai - bi) > 2;
  }).length;
  const crossings = countLinearCrossings(liveStates, edges);

  const complexityScore =
    longEdgeCount * 3 +
    crossings * 2 +
    biDirectional * 1 +
    selfLoops * 0.5;

  if (n <= 7 && complexityScore < 6) return 'linear';
  if (n <= 12 && complexityScore < 20) return 'layered';
  return 'grid';
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT STRATEGIES
// ─────────────────────────────────────────────────────────────────────────────

function linearLayout(order) {
  const positions = {};
  order.forEach((state, i) => {
    positions[state] = { x: MARGIN_X + i * H_GAP, y: MARGIN_Y, row: 'main', index: i };
  });
  return positions;
}

function layeredLayout(order, layers) {
  // Group states by layer
  const byLayer = new Map();
  for (const s of order) {
    const d = layers.get(s) ?? 0;
    if (!byLayer.has(d)) byLayer.set(d, []);
    byLayer.get(d).push(s);
  }

  const positions = {};
  const sortedDepths = [...byLayer.keys()].sort((a, b) => a - b);
  const maxInLayer = Math.max(...[...byLayer.values()].map(arr => arr.length));

  sortedDepths.forEach((depth, colIdx) => {
    const statesInLayer = byLayer.get(depth);
    const totalHeight = (statesInLayer.length - 1) * V_GAP;
    const startY = MARGIN_Y + (maxInLayer - statesInLayer.length) * V_GAP * 0.5;
    statesInLayer.forEach((state, rowIdx) => {
      positions[state] = {
        x: MARGIN_X + colIdx * H_GAP,
        y: startY + rowIdx * V_GAP,
        row: 'main',
        index: colIdx * 100 + rowIdx,
        col: colIdx,
        rowInLayer: rowIdx,
      };
    });
  });

  return positions;
}

function gridLayout(order) {
  const n = order.length;
  // Choose the grid dimensions aiming for roughly square shape
  const cols = Math.ceil(Math.sqrt(n * 1.5));
  const positions = {};
  order.forEach((state, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions[state] = {
      x: MARGIN_X + col * H_GAP,
      y: MARGIN_Y + row * V_GAP,
      row: 'main',
      index: i,
      col,
      gridRow: row,
    };
  });
  return positions;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEAD STATE PLACEMENT
// ─────────────────────────────────────────────────────────────────────────────

function placeDeadStates(deadStates, positions, edges, liveStates) {
  const liveIdx = new Map(liveStates.map((s, i) => [s, i]));
  const incoming = new Map([...deadStates].map(s => [s, []]));
  edges.forEach(edge => {
    if (deadStates.has(edge.to) && !deadStates.has(edge.from)) {
      incoming.get(edge.to)?.push(edge.from);
    }
  });

  // Find the bounding box of live positions
  const xs = Object.values(positions).map(p => p.x);
  const ys = Object.values(positions).map(p => p.y);
  const maxY = Math.max(...ys);
  const minX = Math.min(...xs);

  let extraIdx = 0;
  [...deadStates].forEach((state, di) => {
    const sources = incoming.get(state) ?? [];
    const sourceXs = sources.map(s => positions[s]?.x).filter(v => v != null);
    const anchorX = sourceXs.length
      ? sourceXs.reduce((a, b) => a + b, 0) / sourceXs.length
      : minX + extraIdx * H_GAP;
    extraIdx++;

    positions[state] = {
      x: anchorX,
      y: maxY + V_GAP,
      row: 'dead',
      index: liveStates.length + di,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LAYOUT ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export function layoutStates(automaton, deadStates = collectDeadStates(automaton)) {
  const edges = groupTransitions(automaton);
  const order = bfsOrder(automaton, deadStates, edges);
  const layers = assignLayers(automaton, deadStates, edges);

  const strategy = chooseLayout(order, deadStates, edges);

  let positions;
  if (strategy === 'layered') {
    positions = layeredLayout(order, layers);
  } else if (strategy === 'grid') {
    positions = gridLayout(order);
  } else {
    positions = linearLayout(order);
  }

  if (deadStates.size > 0) {
    placeDeadStates(deadStates, positions, edges, order);
  }

  // Compute canvas dimensions from all positions
  const allPos = Object.values(positions);
  const maxX = Math.max(...allPos.map(p => p.x));
  const maxY = Math.max(...allPos.map(p => p.y));
  const width = Math.max(460, maxX + MARGIN_X + NODE_RADIUS + 60);
  const height = Math.max(280, maxY + MARGIN_Y + NODE_RADIUS + 80);

  return { positions, width, height, primary: order, strategy };
}

// ─────────────────────────────────────────────────────────────────────────────
// EDGE GEOMETRY
// ─────────────────────────────────────────────────────────────────────────────

function boundaryPoint(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    start: { x: from.x + (dx / len) * NODE_RADIUS, y: from.y + (dy / len) * NODE_RADIUS },
    end:   { x: to.x   - (dx / len) * NODE_RADIUS, y: to.y   - (dy / len) * NODE_RADIUS },
  };
}

/**
 * Choose the loop side that is least crowded by adjacent edges.
 * Preference order when scores tie: top > right > bottom > left.
 */
function loopSide(edge, positions, edges) {
  const point = positions[edge.from];
  const score = { top: 0, right: 0, bottom: 0, left: 0 };
  const incident = edges.filter(
    other => other.key !== edge.key && (other.from === edge.from || other.to === edge.from)
  );
  for (const other of incident) {
    const otherState = other.from === edge.from ? other.to : other.from;
    const target = positions[otherState];
    if (!target) continue;
    const dx = target.x - point.x;
    const dy = target.y - point.y;
    if (Math.abs(dx) > Math.abs(dy)) score[dx > 0 ? 'right' : 'left'] += 4;
    else score[dy > 0 ? 'bottom' : 'top'] += 5;
  }
  // Dead states tend to have transitions coming from above — avoid top
  if (point.row === 'dead') score.top += 8;
  return Object.entries(score)
    .sort(
      (a, b) =>
        a[1] - b[1] ||
        ['top', 'right', 'bottom', 'left'].indexOf(a[0]) -
          ['top', 'right', 'bottom', 'left'].indexOf(b[0])
    )[0][0];
}

function selfLoopGeometry(edge, positions, edges) {
  const p = positions[edge.from];
  const r = NODE_RADIUS;
  const o = LOOP_OFFSET;
  const side = loopSide(edge, positions, edges);
  if (side === 'right')
    return {
      path: `M ${p.x + r - 4} ${p.y - 15} C ${p.x + o} ${p.y - 62}, ${p.x + o} ${p.y + 62}, ${p.x + r - 4} ${p.y + 15}`,
      label: { x: p.x + o - 8, y: p.y },
    };
  if (side === 'bottom')
    return {
      path: `M ${p.x - 16} ${p.y + r - 4} C ${p.x - 64} ${p.y + o}, ${p.x + 64} ${p.y + o}, ${p.x + 16} ${p.y + r - 4}`,
      label: { x: p.x, y: p.y + o - 6 },
    };
  if (side === 'left')
    return {
      path: `M ${p.x - r + 4} ${p.y + 15} C ${p.x - o} ${p.y + 62}, ${p.x - o} ${p.y - 62}, ${p.x - r + 4} ${p.y - 15}`,
      label: { x: p.x - o + 8, y: p.y },
    };
  // top (default)
  return {
    path: `M ${p.x - 16} ${p.y - r + 4} C ${p.x - 64} ${p.y - o}, ${p.x + 64} ${p.y - o}, ${p.x + 16} ${p.y - r + 4}`,
    label: { x: p.x, y: p.y - o + 6 },
  };
}

/**
 * Computes path and label position for a regular (non-self) edge.
 * Handles:
 *   • dead-state incoming drop
 *   • bidirectional edge pair separation
 *   • long-span arc lifting
 *   • general straight edges
 */
export function edgeGeometry(edge, positions, edges) {
  const source = positions[edge.from];
  const target = positions[edge.to];
  if (edge.from === edge.to) return selfLoopGeometry(edge, positions, edges);

  const { start, end } = boundaryPoint(source, target);

  // --- Dead state transitions ---
  if (target.row === 'dead' && source.row === 'main') {
    const direction = end.x >= start.x ? 18 : -18;
    const bendY = source.y + 78;
    return {
      path: `M ${start.x} ${start.y} Q ${source.x + direction} ${bendY} ${end.x} ${end.y}`,
      label: { x: (start.x + end.x) / 2 + direction, y: bendY - 14 },
    };
  }
  if (source.row === 'dead' || target.row === 'dead') {
    const bendY = Math.max(source.y, target.y) + 74;
    return {
      path: `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${bendY} ${end.x} ${end.y}`,
      label: { x: (start.x + end.x) / 2, y: bendY + 14 },
    };
  }

  // --- Bidirectional pair: offset the two arrows to avoid overlap ---
  const reverse = edges.find(other => other.from === edge.to && other.to === edge.from);

  // Distance and angle
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.hypot(dx, dy) || 1;
  const span = Math.max(Math.abs(source.col ?? source.index) - Math.abs(target.col ?? target.index) | 0, 1);

  if (reverse) {
    // Perpendicular offset to separate the two curves
    const perpX = (-dy / dist) * 45;
    const perpY = (dx / dist) * 45;
    const midX = (start.x + end.x) / 2 + perpX;
    const midY = (start.y + end.y) / 2 + perpY;
    return {
      path: `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`,
      label: { x: midX, y: midY - 12 },
    };
  }

  // --- Straight short-range edge ---
  const colDiff = Math.abs((source.col ?? source.index) - (target.col ?? target.index));
  const rowDiff = Math.abs((source.gridRow ?? source.rowInLayer ?? 0) - (target.gridRow ?? target.rowInLayer ?? 0));
  const isNeighbour = colDiff <= 1 && rowDiff <= 1;

  if (isNeighbour) {
    const labelMid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    // Offset label slightly to the left of the direction vector
    const perpX = (-dy / dist) * 18;
    const perpY = (dx / dist) * 18;
    return {
      path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      label: { x: labelMid.x + perpX, y: labelMid.y + perpY - 4 },
    };
  }

  // --- Long arched edge ---
  const arcHeight = 70 + colDiff * 28 + rowDiff * 22;
  const perpX = (-dy / dist) * arcHeight;
  const perpY = (dx / dist) * arcHeight;
  const midX = (start.x + end.x) / 2 + perpX;
  const midY = (start.y + end.y) / 2 + perpY;
  return {
    path: `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`,
    label: { x: midX, y: midY - 12 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LABEL COLLISION AVOIDANCE
// ─────────────────────────────────────────────────────────────────────────────

function labelBox(point, text) {
  const width = Math.max(34, text.length * 7.2);
  return { x: point.x - width / 2, y: point.y - 12, width, height: 18 };
}

export function labelIntersectsLabel(a, b) {
  return (
    a.x < b.x + b.width + 7 &&
    a.x + a.width + 7 > b.x &&
    a.y < b.y + b.height + 5 &&
    a.y + a.height + 5 > b.y
  );
}

/**
 * For each edge geometry, push the label position until it no longer overlaps
 * previously placed labels. Also tries horizontal offsets.
 */
export function routeEdges(edges, layout) {
  const { positions } = layout;
  const occupied = [];
  return edges.map(edge => {
    const geometry = edgeGeometry(edge, positions, edges);
    const adjusted = { ...geometry, label: { ...geometry.label } };

    let candidate = labelBox(adjusted.label, edge.label);
    const isSelf = edge.from === edge.to;
    const isDead = positions[edge.to]?.row === 'dead';

    let attempts = 0;
    while (
      occupied.some(existing => labelIntersectsLabel(candidate, existing)) &&
      attempts < 12
    ) {
      if (attempts % 3 === 0) {
        adjusted.label.y += isSelf || isDead ? 20 : -22;
      } else if (attempts % 3 === 1) {
        adjusted.label.x += 22;
      } else {
        adjusted.label.x -= 44;
      }
      candidate = labelBox(adjusted.label, edge.label);
      attempts++;
    }
    occupied.push(candidate);
    return { edge, geometry: adjusted };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY HELPERS (used by StateDiagram for edge crossing detection)
// ─────────────────────────────────────────────────────────────────────────────

function orientation(a, b, c) {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
}
export function edgeIntersectsEdge(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 !== o2 && o3 !== o4;
}
export function edgeIntersectsState(start, end, state, radius = NODE_RADIUS + 8) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((state.x - start.x) * dx + (state.y - start.y) * dy) / lengthSq));
  const closest = { x: start.x + t * dx, y: start.y + t * dy };
  return Math.hypot(state.x - closest.x, state.y - closest.y) < radius;
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION HIGHLIGHTS
// ─────────────────────────────────────────────────────────────────────────────

export function simulationHighlights(automaton, simulation) {
  if (!simulation) return { states: new Set(), edges: new Set() };
  const states = new Set([automaton.startState]);
  const edges = new Set();
  let previous = new Set([automaton.startState]);
  for (const step of simulation.steps ?? []) {
    const next = new Set(step.states ?? []);
    next.forEach(state => states.add(state));
    for (const from of previous)
      for (const to of next)
        edges.add(`${from}\0${to}\0${step.symbol}`);
    previous = next;
  }
  return { states, edges };
}
