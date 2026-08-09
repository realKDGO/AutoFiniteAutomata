/**
 * transitionGeometry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Utility for computing dynamic SVG transition paths, self-loops, and labels
 * based on source state, target state, and snapped connector points.
 */

import { getStateConnectors, CONNECTOR_RADIUS } from './connectorSnap';

const NODE_RADIUS = CONNECTOR_RADIUS; // 32
const LOOP_OFFSET = 102; // distance from node center to loop apex

/**
 * Calculates self-loop geometry oriented toward a given angle (or connector index/label).
 * Supports 8 directions (North, NE, East, SE, South, SW, West, NW).
 *
 * @param {{ x: number, y: number }} center - state position
 * @param {number|string} [connectorOrAngle] - connectorId (0-7), label ('north'...), or angle in degrees (default: 270 / North)
 */
export function computeSelfLoopGeometry(center, connectorOrAngle = 270) {
  let angleDeg = 270; // Default North

  if (typeof connectorOrAngle === 'number') {
    if (connectorOrAngle >= 0 && connectorOrAngle <= 7) {
      // Connector ID (0: N=270, 1: NE=315, 2: E=0, 3: SE=45, 4: S=90, 5: SW=135, 6: W=180, 7: NW=225)
      const angles = [270, 315, 0, 45, 90, 135, 180, 225];
      angleDeg = angles[connectorOrAngle];
    } else {
      angleDeg = connectorOrAngle;
    }
  } else if (typeof connectorOrAngle === 'string') {
    const map = {
      north: 270, 'north-east': 315, east: 0, 'south-east': 45,
      south: 90, 'south-west': 135, west: 180, 'north-west': 225
    };
    angleDeg = map[connectorOrAngle] ?? 270;
  }

  const rad = (angleDeg * Math.PI) / 180;
  const perpRad1 = rad - Math.PI / 4; // -45 deg spread for start
  const perpRad2 = rad + Math.PI / 4; // +45 deg spread for end

  const r = NODE_RADIUS;
  // Boundary start and end points on the state circle
  const start = {
    x: center.x + r * Math.cos(perpRad1),
    y: center.y + r * Math.sin(perpRad1),
  };
  const end = {
    x: center.x + r * Math.cos(perpRad2),
    y: center.y + r * Math.sin(perpRad2),
  };

  // Control points for Cubic Bezier (C) curve loop
  const c1 = {
    x: center.x + LOOP_OFFSET * Math.cos(perpRad1),
    y: center.y + LOOP_OFFSET * Math.sin(perpRad1),
  };
  const c2 = {
    x: center.x + LOOP_OFFSET * Math.cos(perpRad2),
    y: center.y + LOOP_OFFSET * Math.sin(perpRad2),
  };

  // Label positioned near loop apex
  const label = {
    x: center.x + (LOOP_OFFSET * 0.72) * Math.cos(rad),
    y: center.y + (LOOP_OFFSET * 0.72) * Math.sin(rad),
  };

  const path = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;

  return { path, label, start, end };
}

/**
 * Computes dynamic geometry for a transition between source and target,
 * taking optional custom target/source endpoints (e.g. snapped connectors).
 *
 * @param {{ x: number, y: number }} sourceState - source state center position
 * @param {{ x: number, y: number }} targetState - target state center position
 * @param {{ x: number, y: number }} [customTarget] - snapped target endpoint or dragged point
 * @param {{ x: number, y: number }} [customSource] - optional custom source endpoint
 * @param {boolean} [isBidirectional] - whether a reverse transition exists between these states
 */
export function computeTransitionGeometry(
  sourceState,
  targetState,
  customTarget = null,
  customSource = null,
  isBidirectional = false
) {
  // If target point is custom/snapped, determine nearest source boundary point unless customSource is specified
  const effectiveTarget = customTarget ?? boundaryPoint(sourceState, targetState).end;
  
  let effectiveSource = customSource;
  if (!effectiveSource) {
    const dx = effectiveTarget.x - sourceState.x;
    const dy = effectiveTarget.y - sourceState.y;
    const len = Math.hypot(dx, dy) || 1;
    effectiveSource = {
      x: sourceState.x + (dx / len) * NODE_RADIUS,
      y: sourceState.y + (dy / len) * NODE_RADIUS,
    };
  }

  const start = effectiveSource;
  const end = effectiveTarget;

  // Determine if path should be straight or curved (bended)
  const directDx = targetState.x - sourceState.x;
  const directDy = targetState.y - sourceState.y;
  const directDist = Math.hypot(directDx, directDy) || 1;

  // Normal vector perpendicular to direct line
  const nx = -directDy / directDist;
  const ny = directDx / directDist;

  // Calculate deviation of custom target point from natural boundary point
  const naturalEnd = boundaryPoint(sourceState, targetState).end;
  const deviationX = end.x - naturalEnd.x;
  const deviationY = end.y - naturalEnd.y;
  const deviationDist = Math.hypot(deviationX, deviationY);

  // If bidirectional pair, apply standard arc bend offset
  let arcHeight = isBidirectional ? 45 : 0;

  // If custom target deviates significantly from natural target, introduce curvature bend towards target
  if (deviationDist > 12) {
    // Projection of deviation onto normal vector
    const dot = deviationX * nx + deviationY * ny;
    const bendSign = Math.sign(dot) || 1;
    arcHeight = Math.max(Math.abs(arcHeight), Math.min(90, deviationDist * 0.85)) * bendSign;
  }

  if (Math.abs(arcHeight) < 5) {
    // Straight line transition
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const perpX = (-directDy / directDist) * 16;
    const perpY = (directDx / directDist) * 16;

    return {
      path: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
      label: { x: midX + perpX, y: midY + perpY - 4 },
      start,
      end,
    };
  }

  // Curved Quadratic Bezier (Q) transition
  const midX = (start.x + end.x) / 2 + nx * arcHeight;
  const midY = (start.y + end.y) / 2 + ny * arcHeight;

  // Label at apex of curve (t=0.5 along Quadratic Bezier)
  const labelX = 0.25 * start.x + 0.5 * midX + 0.25 * end.x;
  const labelY = 0.25 * start.y + 0.5 * midY + 0.25 * end.y;

  return {
    path: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    label: { x: labelX, y: labelY - 10 },
    start,
    end,
  };
}

function boundaryPoint(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    start: { x: from.x + (dx / len) * NODE_RADIUS, y: from.y + (dy / len) * NODE_RADIUS },
    end:   { x: to.x   - (dx / len) * NODE_RADIUS, y: to.y   - (dy / len) * NODE_RADIUS },
  };
}
