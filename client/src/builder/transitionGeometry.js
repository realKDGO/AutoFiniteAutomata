/** SVG geometry derived exclusively from state positions and logical connector ids. */
import { CONNECTOR_RADIUS } from './connectorSnap';

const NODE_RADIUS = CONNECTOR_RADIUS;
const CONNECTOR_RADIUS_OFFSET = NODE_RADIUS + 4;
const CONNECTOR_ANGLES = [270, 315, 0, 45, 90, 135, 180, 225];

function connectorPoint(center, connectorId) {
  const radians = (CONNECTOR_ANGLES[connectorId] ?? 270) * Math.PI / 180;
  return {
    x: center.x + CONNECTOR_RADIUS_OFFSET * Math.cos(radians),
    y: center.y + CONNECTOR_RADIUS_OFFSET * Math.sin(radians),
  };
}

export function computeSelfLoopGeometry(center, sourceConnectorId = 0, targetConnectorId = 2) {
  const start = connectorPoint(center, sourceConnectorId);
  const end = connectorPoint(center, targetConnectorId);
  const sourceRadians = (CONNECTOR_ANGLES[sourceConnectorId] ?? 270) * Math.PI / 180;
  const targetRadians = (CONNECTOR_ANGLES[targetConnectorId] ?? 0) * Math.PI / 180;
  let vx = Math.cos(sourceRadians) + Math.cos(targetRadians);
  let vy = Math.sin(sourceRadians) + Math.sin(targetRadians);
  if (Math.hypot(vx, vy) < 0.1) {
    vx = Math.cos(sourceRadians);
    vy = Math.sin(sourceRadians);
  }
  const length = Math.hypot(vx, vy) || 1;
  const outward = { x: vx / length, y: vy / length };
  const tangent = { x: -outward.y, y: outward.x };
  // Route through a dedicated outer apex. Two cubic segments keep even
  // opposite connector pairs from cutting across the state centre.
  const apex = { x: center.x + outward.x * 118, y: center.y + outward.y * 118 };
  const sourceArm = { x: start.x + Math.cos(sourceRadians) * 64, y: start.y + Math.sin(sourceRadians) * 64 };
  const targetArm = { x: end.x + Math.cos(targetRadians) * 64, y: end.y + Math.sin(targetRadians) * 64 };
  const apexEntry = { x: apex.x + tangent.x * 38, y: apex.y + tangent.y * 38 };
  const apexExit = { x: apex.x - tangent.x * 38, y: apex.y - tangent.y * 38 };
  return {
    path: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${sourceArm.x.toFixed(1)} ${sourceArm.y.toFixed(1)}, ${apexEntry.x.toFixed(1)} ${apexEntry.y.toFixed(1)}, ${apex.x.toFixed(1)} ${apex.y.toFixed(1)} C ${apexExit.x.toFixed(1)} ${apexExit.y.toFixed(1)}, ${targetArm.x.toFixed(1)} ${targetArm.y.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    label: { x: apex.x + tangent.x * 18, y: apex.y + tangent.y * 18 },
    start,
    end,
  };
}

/**
 * Given a transition's actual rendered endpoints, returns the midpoint of
 * the straight line between them. This is the reference point that a
 * manual bend's stored (dx, dy) offset is applied to — both when computing
 * geometry for rendering and when converting a pointer/handle position back
 * into a storable bend offset.
 */
export function transitionMidpoint(start, end) {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

/**
 * Converts an absolute point (e.g. the current pointer position while
 * dragging the bend handle) into a storable manual-bend offset, relative to
 * the transition's current start/end midpoint.
 */
export function bendOffsetFromPoint(start, end, point) {
  const mid = transitionMidpoint(start, end);
  return { dx: point.x - mid.x, dy: point.y - mid.y };
}

export function computeTransitionGeometry(sourceState, targetState, customTarget = null, customSource = null, isBidirectional = false, manualBend = null) {
  const natural = boundaryPoint(sourceState, targetState);
  const start = customSource ?? natural.start;
  const end = customTarget ?? natural.end;
  const dx = targetState.x - sourceState.x;
  const dy = targetState.y - sourceState.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = -dy / distance;
  const ny = dx / distance;

  // ── Manual override: the user has dragged a bend handle for this
  // transition. Skip automatic arc-height routing entirely and build the
  // curve from the stored (dx, dy) offset relative to the current midpoint.
  // Source/destination connector points (start/end) are completely
  // untouched — only the control point moves.
  if (manualBend) {
    const mid = transitionMidpoint(start, end);
    const controlX = mid.x + (manualBend.dx ?? 0);
    const controlY = mid.y + (manualBend.dy ?? 0);
    return {
      path: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
      label: { x: 0.25 * start.x + 0.5 * controlX + 0.25 * end.x, y: 0.25 * start.y + 0.5 * controlY + 0.25 * end.y - 10 },
      control: { x: controlX, y: controlY },
      start, end,
    };
  }

  const sourceDeviation = { x: start.x - natural.start.x, y: start.y - natural.start.y };
  const targetDeviation = { x: end.x - natural.end.x, y: end.y - natural.end.y };
  const deviation = { x: targetDeviation.x - sourceDeviation.x, y: targetDeviation.y - sourceDeviation.y };
  const deviationDistance = Math.hypot(deviation.x, deviation.y);
  let arcHeight = isBidirectional ? 42 : 0;
  if (deviationDistance > 8) {
    const sign = Math.sign(deviation.x * nx + deviation.y * ny) || 1;
    arcHeight = Math.max(Math.abs(arcHeight), Math.min(88, deviationDistance * 0.9)) * sign;
  }
  if (Math.abs(arcHeight) < 5) {
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    return {
      path: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
      label: { x: midX + nx * 16, y: midY + ny * 16 - 4 },
      control: { x: midX, y: midY },
      start, end,
    };
  }
  const controlX = (start.x + end.x) / 2 + nx * arcHeight;
  const controlY = (start.y + end.y) / 2 + ny * arcHeight;
  return {
    path: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    label: { x: 0.25 * start.x + 0.5 * controlX + 0.25 * end.x, y: 0.25 * start.y + 0.5 * controlY + 0.25 * end.y - 10 },
    control: { x: controlX, y: controlY },
    start, end,
  };
}

function boundaryPoint(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    start: { x: from.x + (dx / length) * NODE_RADIUS, y: from.y + (dy / length) * NODE_RADIUS },
    end: { x: to.x - (dx / length) * NODE_RADIUS, y: to.y - (dy / length) * NODE_RADIUS },
  };
}
