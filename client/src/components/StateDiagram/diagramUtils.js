// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const NODE_RADIUS = 32;
const H_GAP = 190;   // horizontal gap between state centres in linear/layered layout
const V_GAP = 160;   // vertical gap between rows in multi-row/layered layouts
const MARGIN_X = 115;
const MARGIN_Y = 115;
const LOOP_OFFSET = 102; // distance from node centre to loop apex

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY SAFETY LAYER
// ─────────────────────────────────────────────────────────────────────────────

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Column/row separation between two laid-out points, used to decide edge
 * routing (straight vs. arched) and arc height.
 */
function gridSeparation(source, target) {
  const sourceCol = source.col ?? source.index;
  const targetCol = target.col ?? target.index;
  const colDiff =
    isFiniteNumber(sourceCol) && isFiniteNumber(targetCol)
      ? Math.abs(sourceCol - targetCol)
      : Math.abs((target.x ?? 0) - (source.x ?? 0)) / H_GAP;

  const sourceRow = source.gridRow ?? source.rowInLayer;
  const targetRow = target.gridRow ?? target.rowInLayer;
  const rowDiff =
    isFiniteNumber(sourceRow) && isFiniteNumber(targetRow)
      ? Math.abs(sourceRow - targetRow)
      : Math.abs((target.y ?? 0) - (source.y ?? 0)) / V_GAP;

  return { colDiff, rowDiff };
}

/**
 * Verifies a geometry object has finite path coordinates and a finite label
 * position.
 */
function safeGeometry(geometry, start, end) {
  const numbersInPath = geometry.path.match(/-?\d+(\.\d+)?/g) ?? [];
  const pathIsFinite = numbersInPath.length > 0 && numbersInPath.every(n => Number.isFinite(Number(n)));
  const labelIsFinite = isFiniteNumber(geometry.label?.x) && isFiniteNumber(geometry.label?.y);
  if (pathIsFinite && labelIsFinite) return geometry;

  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return {
    ...geometry,
    path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    label: mid,
    start,
    end,
  };
}

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
// GRAPH ANALYSIS & ORDERING
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
  const maxDepth = Math.max(0, ...layers.values());
  for (const s of automaton.states) {
    if (!deadStates.has(s) && !layers.has(s)) layers.set(s, maxDepth + 1);
  }
  return layers;
}

/**
 * Counts crossing pairs between straight-line edges given a position map.
 */
function countLinearCrossings(order, edgeList) {
  let crossings = 0;
  const idx = new Map(order.map((s, i) => [s, i]));
  const segments = edgeList
    .filter(e => e.from !== e.to && idx.has(e.from) && idx.has(e.to))
    .map(e => [idx.get(e.from), idx.get(e.to)]);
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const [a, b] = segments[i];
      const [c, d] = segments[j];
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

  if (n <= 6 && complexityScore < 6) return 'linear';
  if (n <= 12 && complexityScore < 22) return 'layered';
  return 'grid';
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT STRATEGIES
// ─────────────────────────────────────────────────────────────────────────────

function linearLayout(order) {
  const positions = {};
  order.forEach((state, i) => {
    positions[state] = {
      x: MARGIN_X + i * H_GAP,
      y: MARGIN_Y,
      row: 'main',
      index: i,
      col: i,
      rowInLayer: 0,
    };
  });
  return positions;
}

function layeredLayout(order, layers, edges) {
  const byLayer = new Map();
  for (const s of order) {
    const d = layers.get(s) ?? 0;
    if (!byLayer.has(d)) byLayer.set(d, []);
    byLayer.get(d).push(s);
  }

  const sortedDepths = [...byLayer.keys()].sort((a, b) => a - b);

  // Intra-layer barycenter ordering to minimize line crossings between adjacent layers
  for (let i = 1; i < sortedDepths.length; i++) {
    const prevDepth = sortedDepths[i - 1];
    const currDepth = sortedDepths[i];
    const prevStates = byLayer.get(prevDepth);
    const currStates = byLayer.get(currDepth);

    const prevIndexMap = new Map(prevStates.map((s, idx) => [s, idx]));

    const stateBarycenter = currStates.map(state => {
      const incoming = edges.filter(e => e.to === state && prevIndexMap.has(e.from));
      if (incoming.length === 0) return { state, weight: 0 };
      const avgIdx = incoming.reduce((sum, e) => sum + prevIndexMap.get(e.from), 0) / incoming.length;
      return { state, weight: avgIdx };
    });

    stateBarycenter.sort((a, b) => a.weight - b.weight);
    byLayer.set(currDepth, stateBarycenter.map(item => item.state));
  }

  const positions = {};
  const maxInLayer = Math.max(...[...byLayer.values()].map(arr => arr.length));

  sortedDepths.forEach((depth, colIdx) => {
    const statesInLayer = byLayer.get(depth);
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
  const cols = Math.ceil(Math.sqrt(n * 1.4));
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
  const incoming = new Map([...deadStates].map(s => [s, []]));
  edges.forEach(edge => {
    if (deadStates.has(edge.to) && !deadStates.has(edge.from)) {
      incoming.get(edge.to)?.push(edge.from);
    }
  });

  const xs = Object.values(positions).map(p => p.x);
  const ys = Object.values(positions).map(p => p.y);
  const maxY = Math.max(...ys);
  const minX = Math.min(...xs);

  const deadArray = [...deadStates];
  const placedXs = [];

  deadArray.forEach((state, di) => {
    const sources = incoming.get(state) ?? [];
    const sourceXs = sources.map(s => positions[s]?.x).filter(v => v != null);
    let targetX = sourceXs.length
      ? sourceXs.reduce((a, b) => a + b, 0) / sourceXs.length
      : minX + di * H_GAP;

    // Ensure distinct non-overlapping placement for multiple dead states
    for (const prevX of placedXs) {
      if (Math.abs(targetX - prevX) < H_GAP * 0.8) {
        targetX = prevX + H_GAP;
      }
    }
    placedXs.push(targetX);

    positions[state] = {
      x: targetX,
      y: maxY + V_GAP,
      row: 'dead',
      index: liveStates.length + di,
      col: di,
      gridRow: 99,
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
    positions = layeredLayout(order, layers, edges);
  } else if (strategy === 'grid') {
    positions = gridLayout(order);
  } else {
    positions = linearLayout(order);
  }

  if (deadStates.size > 0) {
    placeDeadStates(deadStates, positions, edges, order);
  }

  // Compute adaptive canvas dimensions
  const allPos = Object.values(positions);
  const minX = Math.min(...allPos.map(p => p.x));
  const maxX = Math.max(...allPos.map(p => p.x));
  const minY = Math.min(...allPos.map(p => p.y));
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
 * Choose the loop side that is least crowded by adjacent edges, start arrow, and arched paths.
 * Preference order when scores tie: top > right > bottom > left.
 */
export function loopSide(edge, positions, edges, startState = null) {
  const point = positions[edge.from];
  if (!point) return 'top';
  const score = { top: 0, right: 0, bottom: 0, left: 0 };

  // 1. Incident edges
  const incident = edges.filter(
    other => other.key !== edge.key && (other.from === edge.from || other.to === edge.from)
  );
  for (const other of incident) {
    const otherState = other.from === edge.from ? other.to : other.from;
    const target = positions[otherState];
    if (!target) continue;
    const dx = target.x - point.x;
    const dy = target.y - point.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      score[dx > 0 ? 'right' : 'left'] += 5;
    } else {
      score[dy > 0 ? 'bottom' : 'top'] += 5;
    }
  }

  // 2. Start state has incoming start arrow on the left
  if (edge.from === startState || (point.x === MARGIN_X && point.y === MARGIN_Y && point.row === 'main')) {
    score.left += 15;
  }

  // 3. Spanning/arched edges passing over/under this state
  for (const other of edges) {
    if (other.from === other.to) continue;
    const src = positions[other.from];
    const tgt = positions[other.to];
    if (!src || !tgt) continue;
    const minEdgeX = Math.min(src.x, tgt.x);
    const maxEdgeX = Math.max(src.x, tgt.x);
    if (point.x > minEdgeX + 25 && point.x < maxEdgeX - 25) {
      if (tgt.x < src.x) {
        score.top += 6;   // Backward arcs arch TOP
      } else {
        score.bottom += 6; // Forward arcs arch BOTTOM
      }
    }
  }

  // 4. Dead states receive transitions dropping from above
  if (point.row === 'dead') {
    score.top += 12;
  }

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

  if (side === 'right') {
    const start = { x: p.x + r - 4, y: p.y - 15 };
    const end = { x: p.x + r - 4, y: p.y + 15 };
    return { path: `M ${start.x} ${start.y} C ${p.x + o} ${p.y - 62}, ${p.x + o} ${p.y + 62}, ${end.x} ${end.y}`, label: { x: p.x + o - 8, y: p.y }, start, end };
  }
  if (side === 'bottom') {
    const start = { x: p.x - 16, y: p.y + r - 4 };
    const end = { x: p.x + 16, y: p.y + r - 4 };
    return { path: `M ${start.x} ${start.y} C ${p.x - 64} ${p.y + o}, ${p.x + 64} ${p.y + o}, ${end.x} ${end.y}`, label: { x: p.x, y: p.y + o - 6 }, start, end };
  }
  if (side === 'left') {
    const start = { x: p.x - r + 4, y: p.y + 15 };
    const end = { x: p.x - r + 4, y: p.y - 15 };
    return { path: `M ${start.x} ${start.y} C ${p.x - o} ${p.y + 62}, ${p.x - o} ${p.y - 62}, ${end.x} ${end.y}`, label: { x: p.x - o + 8, y: p.y }, start, end };
  }
  // top (default)
  const start = { x: p.x - 16, y: p.y - r + 4 };
  const end = { x: p.x + 16, y: p.y - r + 4 };
  return { path: `M ${start.x} ${start.y} C ${p.x - 64} ${p.y - o}, ${p.x + 64} ${p.y - o}, ${end.x} ${end.y}`, label: { x: p.x, y: p.y - o + 6 }, start, end };
}

/**
 * Computes path and label position for a regular (non-self) edge.
 * Handles:
 *   • dead-state incoming drop
 *   • bidirectional edge pair separation (opposite perpendicular bends)
 *   • long-span arc lifting (clearing intervening states)
 *   • short-range straight edges
 */
export function edgeGeometry(edge, positions, edges) {
  const source = positions[edge.from] || (positions[edge.from?.name] ?? { x: 150, y: 160 });
  const target = positions[edge.to] || (positions[edge.to?.name] ?? { x: 300, y: 160 });
  if (!source || !target) return { path: 'M 0 0 L 0 0', label: { x: 0, y: 0 }, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
  if (edge.from === edge.to) return selfLoopGeometry(edge, positions, edges);

  const { start, end } = boundaryPoint(source, target);

  // --- Dead state transitions ---
  if (target.row === 'dead' && source.row === 'main') {
    const direction = end.x >= start.x ? 18 : -18;
    const bendY = source.y + 78;
    return safeGeometry(
      {
        path: `M ${start.x} ${start.y} Q ${source.x + direction} ${bendY} ${end.x} ${end.y}`,
        label: { x: (start.x + end.x) / 2 + direction, y: bendY - 14 },
        start,
        end,
      },
      start,
      end
    );
  }
  if (source.row === 'dead' || target.row === 'dead') {
    const bendY = Math.max(source.y, target.y) + 74;
    return safeGeometry(
      {
        path: `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${bendY} ${end.x} ${end.y}`,
        label: { x: (start.x + end.x) / 2, y: bendY + 14 },
        start,
        end,
      },
      start,
      end
    );
  }

  // --- Bidirectional pair: offset the two curves in opposite directions ---
  const reverse = edges.find(other => other.from === edge.to && other.to === edge.from);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.hypot(dx, dy) || 1;

  if (reverse) {
    const offsetMag = 48;
    const perpX = (-dy / dist) * offsetMag;
    const perpY = (dx / dist) * offsetMag;
    const midX = (start.x + end.x) / 2 + perpX;
    const midY = (start.y + end.y) / 2 + perpY;

    // Label placed on outer side of bend so it never crosses the curve
    const labelX = midX + (perpX / offsetMag) * 12;
    const labelY = midY + (perpY / offsetMag) * 12;

    return safeGeometry(
      {
        path: `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`,
        label: { x: labelX, y: labelY },
        start,
        end,
      },
      start,
      end
    );
  }

  // --- Straight short-range edge ---
  const { colDiff, rowDiff } = gridSeparation(source, target);
  const isNeighbour = colDiff <= 1 && rowDiff <= 1;

  if (isNeighbour) {
    const labelMid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const perpX = (-dy / dist) * 18;
    const perpY = (dx / dist) * 18;
    return safeGeometry(
      {
        path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
        label: { x: labelMid.x + perpX, y: labelMid.y + perpY - 4 },
        start,
        end,
      },
      start,
      end
    );
  }

  // --- Long arched edge (clears intervening nodes) ---
  const arcHeight = 70 + colDiff * 28 + rowDiff * 22;
  const normX = (-dy / dist) * arcHeight;
  const normY = (dx / dist) * arcHeight;
  const midX = (start.x + end.x) / 2 + normX;
  const midY = (start.y + end.y) / 2 + normY;

  return safeGeometry(
    {
      path: `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`,
      label: { x: midX + (normX / (arcHeight || 1)) * 14, y: midY + (normY / (arcHeight || 1)) * 14 },
      start,
      end,
    },
    start,
    end
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LABEL COLLISION AVOIDANCE
// ─────────────────────────────────────────────────────────────────────────────

function labelBox(point, text) {
  const width = Math.max(34, (text ?? '').length * 7.5 + 10);
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

export function labelIntersectsState(labelPt, statePt, radius = NODE_RADIUS + 8) {
  return Math.hypot(labelPt.x - statePt.x, labelPt.y - statePt.y) < radius;
}

/**
 * Adjusts label positions to avoid overlaps with previously placed labels and state nodes.
 */
export function routeEdges(edges, layout) {
  const { positions } = layout;
  const statePoints = Object.values(positions);
  const occupied = [];

  return edges.map(edge => {
    const geometry = edgeGeometry(edge, positions, edges);
    const adjusted = { ...geometry, label: { ...geometry.label } };

    let candidate = labelBox(adjusted.label, edge.label);
    const isSelf = edge.from === edge.to;
    const isDead = positions[edge.to]?.row === 'dead';

    let attempts = 0;
    while (
      (occupied.some(existing => labelIntersectsLabel(candidate, existing)) ||
       statePoints.some(pt => labelIntersectsState(adjusted.label, pt))) &&
      attempts < 14
    ) {
      if (attempts % 3 === 0) {
        adjusted.label.y += isSelf || isDead ? 20 : -22;
      } else if (attempts % 3 === 1) {
        adjusted.label.x += 24;
      } else {
        adjusted.label.x -= 48;
      }
      candidate = labelBox(adjusted.label, edge.label);
      attempts++;
    }
    occupied.push(candidate);
    return { edge, geometry: adjusted };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY HELPERS (used for intersection detection)
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
