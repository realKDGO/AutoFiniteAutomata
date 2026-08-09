/**
 * connectorSnap.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure-function helpers for the Builder's magnetic connector-point system.
 *
 * Every state has 8 invisible connector points distributed evenly around
 * its perimeter (N, NE, E, SE, S, SW, W, NW at 45° intervals). When the
 * user drags a transition arrow endpoint near a state the nearest connector
 * becomes the snap target — with hysteresis so the snap stays stable instead
 * of flickering between nearby connectors.
 *
 * These helpers carry zero React dependencies and do not read or write any
 * automaton data. They operate entirely in SVG viewBox coordinates.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Base state radius (must match NODE_RADIUS in BuilderCanvas / diagramUtils). */
export const CONNECTOR_RADIUS = 32;

/**
 * How far outside the node boundary the connector sits (SVG units).
 * Placing the connector slightly past the circle edge means the arrowhead
 * terminates cleanly at the boundary rather than overlapping the node fill.
 */
const BOUNDARY_OFFSET = 4;

/**
 * Distance (SVG units) at which an approaching endpoint begins snapping.
 * "Enter snap zone."
 */
export const SNAP_DISTANCE = 55;

/**
 * Distance (SVG units) at which a snapped endpoint is released.
 * Must be > SNAP_DISTANCE to create a hysteresis band that prevents
 * rapid connector switching when the pointer hovers between two connectors.
 */
export const RELEASE_DISTANCE = 70;

/**
 * Distance (SVG units) from a state centre at which its connector dots
 * become visible. Using a slightly larger value than RELEASE_DISTANCE so
 * the dots appear just before snapping would occur.
 */
export const VISIBILITY_DISTANCE = 90;

// ─────────────────────────────────────────────────────────────────────────────
// Connector geometry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 8 compass point descriptors in clockwise order starting from North.
 * Each entry: { id (0-7), label, angleDeg }
 */
const COMPASS_POINTS = [
  { id: 0, label: 'north',      angleDeg: 270 },
  { id: 1, label: 'north-east', angleDeg: 315 },
  { id: 2, label: 'east',       angleDeg:   0 },
  { id: 3, label: 'south-east', angleDeg:  45 },
  { id: 4, label: 'south',      angleDeg:  90 },
  { id: 5, label: 'south-west', angleDeg: 135 },
  { id: 6, label: 'west',       angleDeg: 180 },
  { id: 7, label: 'north-west', angleDeg: 225 },
];

/**
 * Returns the 8 connector points for a single state.
 *
 * @param {{ position: { x: number, y: number } }} state
 * @param {number} [radius] - override for the node radius (default: CONNECTOR_RADIUS)
 * @returns {{ id: number, label: string, x: number, y: number }[]}
 */
export function getStateConnectors(state, radius = CONNECTOR_RADIUS) {
  const { x, y } = state.position ?? { x: 0, y: 0 };
  const r = radius + BOUNDARY_OFFSET;
  return COMPASS_POINTS.map(({ id, label, angleDeg }) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      id,
      label,
      x: x + r * Math.cos(rad),
      y: y + r * Math.sin(rad),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Snap calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snap result shape:
 * {
 *   stateId:     string,
 *   connectorId: number,   // 0-7
 *   label:       string,   // 'north' | 'north-east' | …
 *   x:           number,   // SVG viewBox coordinate
 *   y:           number,
 * }
 */

/**
 * Given the current pointer position and all states on the canvas, returns
 * the nearest eligible snap result (or null if nothing is close enough).
 *
 * Implements hysteresis:
 *   - Once snapped to a connector, remain there until the pointer moves
 *     beyond RELEASE_DISTANCE from that connector.
 *   - Only then scan for a new snap candidate within SNAP_DISTANCE.
 *
 * This prevents rapid connector switching ("connector fighting") when the
 * pointer hovers between two nearby connectors.
 *
 * @param {{ x: number, y: number }} pointer  — current drag position in SVG coords
 * @param {Array}                    states   — automaton.states array
 * @param {object|null}              currentSnap — the currently active snap result (or null)
 * @param {object}                   [opts]
 * @param {number}                   [opts.snapDist]    — default SNAP_DISTANCE
 * @param {number}                   [opts.releaseDist] — default RELEASE_DISTANCE
 * @param {string|null}              [opts.excludeStateId] — skip connectors of this state
 *                                    (used to prevent a new-transition from snapping
 *                                    back to its own source state while dragging)
 * @returns {object|null}
 */
export function getNearestSnap(
  pointer,
  states,
  currentSnap,
  {
    snapDist    = SNAP_DISTANCE,
    releaseDist = RELEASE_DISTANCE,
    excludeStateId = null,
  } = {}
) {
  // ── 1. Hysteresis guard ──────────────────────────────────────────────────
  // If we already have a snap, keep it while the pointer is still within the
  // release threshold of that specific connector.
  if (currentSnap !== null) {
    const dx = pointer.x - currentSnap.x;
    const dy = pointer.y - currentSnap.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= releaseDist) {
      return currentSnap; // hold steady
    }
    // Pointer moved far enough — fall through to re-evaluate
  }

  // ── 2. Scan all connectors ───────────────────────────────────────────────
  let best = null;
  let bestDist = snapDist; // only accept connectors within this radius

  for (const state of states) {
    if (excludeStateId && state.id === excludeStateId) continue;

    // Quick-reject: skip states whose centre is clearly too far away.
    const cx = state.position?.x ?? 0;
    const cy = state.position?.y ?? 0;
    const centreDistApprox = Math.abs(pointer.x - cx) + Math.abs(pointer.y - cy);
    if (centreDistApprox > releaseDist + (CONNECTOR_RADIUS + BOUNDARY_OFFSET) + snapDist) {
      continue;
    }

    const connectors = getStateConnectors(state);
    for (const conn of connectors) {
      const d = Math.hypot(pointer.x - conn.x, pointer.y - conn.y);
      if (d < bestDist) {
        bestDist = d;
        best = {
          stateId:     state.id,
          connectorId: conn.id,
          label:       conn.label,
          x:           conn.x,
          y:           conn.y,
        };
      }
    }
  }

  return best; // null if nothing is close enough
}

// ─────────────────────────────────────────────────────────────────────────────
// Visibility helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the id of the state whose connectors should currently be shown, or
 * null if the pointer is not close enough to any state.
 *
 * Connector dots are shown for the single nearest state within
 * VISIBILITY_DISTANCE of its centre (not the connector boundary — the
 * centre, so dots appear slightly before the snap threshold kicks in).
 *
 * @param {{ x: number, y: number }} pointer
 * @param {Array}                    states
 * @returns {string|null}
 */
export function getVisibleConnectorStateId(pointer, states) {
  let bestId   = null;
  let bestDist = VISIBILITY_DISTANCE;

  for (const state of states) {
    const cx = state.position?.x ?? 0;
    const cy = state.position?.y ?? 0;
    const d  = Math.hypot(pointer.x - cx, pointer.y - cy);
    if (d < bestDist) {
      bestDist = d;
      bestId   = state.id;
    }
  }

  return bestId;
}
