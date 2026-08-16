import { computeSelfLoopGeometry, computeTransitionGeometry } from './transitionGeometry';
import { getArrowColor } from '../components/StateDiagram/TransitionEdge';

const NODE_RADIUS = 32;
const ACCEPTING_RADIUS = 36;
const PADDING = 65;

function sanitizeFilenamePart(name) {
  const cleaned = (name ?? '').trim().replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_');
  return cleaned || 'Automaton';
}

export function buildImageExportFilename(name) {
  return `AutoFA_${sanitizeFilenamePart(name)}.png`;
}

const MARKER_COLORS = {
  sim:      '#f59e0b',
  selected: '#1683d8',
  red:      '#ef4444',
  green:    '#22c55e',
  blue:     '#3b82f6',
  cyan:     '#06b6d4',
  magenta:  '#d946ef',
  yellow:   '#eab308',
  default:  '#607083',
};

/**
 * Calculates complete diagram bounding box covering states, initial state arrow,
 * transition curves, control points, labels, and self-loops.
 */
function calculateDiagramBounds(states, routes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of states) {
    const r = s.accepting ? ACCEPTING_RADIUS : NODE_RADIUS;
    let left = s.position.x - r;
    if (s.initial) {
      left = Math.min(left, s.position.x - 65);
    }
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, s.position.x + r);
    minY = Math.min(minY, s.position.y - r);
    maxY = Math.max(maxY, s.position.y + r);
  }

  for (const { geometry, edge } of routes) {
    const labelWidth = Math.max(34, (edge.label || '').length * 7.2);
    const labelHalf = labelWidth / 2;

    minX = Math.min(minX, geometry.start.x, geometry.end.x, geometry.label.x - labelHalf);
    maxX = Math.max(maxX, geometry.start.x, geometry.end.x, geometry.label.x + labelHalf);
    minY = Math.min(minY, geometry.start.y, geometry.end.y, geometry.label.y - 12);
    maxY = Math.max(maxY, geometry.start.y, geometry.end.y, geometry.label.y + 12);

    if (geometry.control) {
      minX = Math.min(minX, geometry.control.x);
      maxX = Math.max(maxX, geometry.control.x);
      minY = Math.min(minY, geometry.control.y);
      maxY = Math.max(maxY, geometry.control.y);
    }
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Export the current automaton diagram as a PNG image.
 */
export async function exportAutomatonAsPng({ automaton, stateById, groupedEdges, loadedName, isDarkMode = false }) {
  if (!automaton?.states || automaton.states.length === 0) {
    return { ok: false, error: 'empty' };
  }

  // 1. Compute geometry for all routes
  const getStateConnectors = state => {
    const { x, y } = state.position;
    const r = NODE_RADIUS;
    const diag = r * Math.SQRT1_2;
    return [
      { id: 0, x, y: y - r },
      { id: 1, x: x + diag, y: y - diag },
      { id: 2, x: x + r, y },
      { id: 3, x: x + diag, y: y + diag },
      { id: 4, x, y: y + r },
      { id: 5, x: x - diag, y: y + diag },
      { id: 6, x: x - r, y },
      { id: 7, x: x - diag, y: y - diag },
    ];
  };

  const routes = groupedEdges.map(edge => {
    const source = stateById[edge.from];
    const target = stateById[edge.to];
    if (!source || !target) return null;

    const sourceConnector = getStateConnectors(source).find(point => point.id === edge.sourceConnectorId);
    const targetConnector = getStateConnectors(target).find(point => point.id === edge.targetConnectorId);
    const geometry = edge.from === edge.to
      ? computeSelfLoopGeometry(source.position, edge.sourceConnectorId, edge.targetConnectorId)
      : computeTransitionGeometry(source.position, target.position, targetConnector, sourceConnector, groupedEdges.some(other => other.from === edge.to && other.to === edge.from), edge.bend);
    return { edge, geometry };
  }).filter(Boolean);

  // 2. Compute bounding box
  const bounds = calculateDiagramBounds(automaton.states, routes);
  const width = Math.max(200, bounds.maxX - bounds.minX + 2 * PADDING);
  const height = Math.max(200, bounds.maxY - bounds.minY + 2 * PADDING);
  const viewBoxX = bounds.minX - PADDING;
  const viewBoxY = bounds.minY - PADDING;

  // Colors based on dark / light mode
  const bgFill = isDarkMode ? '#0f172a' : '#ffffff';
  const nodeFill = isDarkMode ? '#17212d' : '#ffffff';
  const nodeStroke = isDarkMode ? '#a9b7c6' : '#607083';
  const textFill = isDarkMode ? '#e6edf5' : '#17212b';
  const labelBg = isDarkMode ? '#17212d' : '#ffffff';
  const deadStroke = isDarkMode ? '#f08a8a' : '#c94c4c';
  const deadFill = isDarkMode ? '#48252a' : '#fff0f0';

  // 3. Construct clean standalone SVG string
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX} ${viewBoxY} ${width} ${height}" width="${width}" height="${height}">`;

  // Background rect
  svgContent += `<rect x="${viewBoxX}" y="${viewBoxY}" width="${width}" height="${height}" fill="${bgFill}"/>`;

  // Defs & Arrow markers
  svgContent += `<defs>`;
  svgContent += `<marker id="autofa-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`;
  svgContent += `<path d="M 0 0 L 10 5 L 0 10 z" fill="${nodeStroke}"/>`;
  svgContent += `</marker>`;
  for (const [colorKey, hex] of Object.entries(MARKER_COLORS)) {
    svgContent += `<marker id="autofa-arrowhead-${colorKey}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`;
    svgContent += `<path d="M 0 0 L 10 5 L 0 10 z" fill="${hex}"/>`;
    svgContent += `</marker>`;
  }
  svgContent += `</defs>`;

  // Initial State Arrow
  const initial = automaton.states.find(s => s.initial);
  if (initial) {
    svgContent += `<path d="M ${initial.position.x - 60} ${initial.position.y} L ${initial.position.x - NODE_RADIUS - 4} ${initial.position.y}" fill="none" stroke="${nodeStroke}" stroke-width="2" marker-end="url(#autofa-arrowhead)"/>`;
  }

  // Transition Edges
  for (const { edge, geometry } of routes) {
    const edgeColorInfo = getArrowColor(edge, automaton.alphabet);
    const strokeColor = edgeColorInfo.hex;
    const markerId = `autofa-arrowhead-${edgeColorInfo.name}`;
    const labelWidth = Math.max(34, (edge.label || '').length * 7.2);

    svgContent += `<g>`;
    svgContent += `<path d="${geometry.path}" fill="none" stroke="${strokeColor}" stroke-width="2" marker-end="url(#${markerId})"/>`;
    svgContent += `<rect x="${geometry.label.x - labelWidth / 2}" y="${geometry.label.y - 12}" width="${labelWidth}" height="18" rx="5" fill="${labelBg}" stroke="${strokeColor}" stroke-width="1"/>`;
    svgContent += `<text x="${geometry.label.x}" y="${geometry.label.y + 1}" text-anchor="middle" fill="${strokeColor}" font-family="sans-serif" font-size="11" font-weight="600" dominant-baseline="central">${edge.label}</text>`;
    svgContent += `</g>`;
  }

  // State Nodes
  for (const state of automaton.states) {
    const stroke = state.dead ? deadStroke : nodeStroke;
    const fill = state.dead ? deadFill : nodeFill;

    svgContent += `<g>`;
    if (state.accepting) {
      svgContent += `<circle cx="${state.position.x}" cy="${state.position.y}" r="36" fill="none" stroke="${stroke}" stroke-width="2"/>`;
    }
    svgContent += `<circle cx="${state.position.x}" cy="${state.position.y}" r="32" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    svgContent += `<text x="${state.position.x}" y="${state.position.y + 1}" text-anchor="middle" fill="${textFill}" font-family="sans-serif" font-size="13" font-weight="600" dominant-baseline="central">${state.name}</text>`;
    svgContent += `</g>`;
  }

  svgContent += `</svg>`;

  // 4. Rasterize to Canvas at 2x scale for sharp output
  const scale = 2;
  const canvasWidth = width * scale;
  const canvasHeight = height * scale;

  return new Promise(resolve => {
    const img = new Image();
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve({ ok: false, error: 'export-failed' });
          return;
        }

        ctx.fillStyle = bgFill;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

        URL.revokeObjectURL(url);

        canvas.toBlob(blob => {
          if (!blob) {
            resolve({ ok: false, error: 'export-failed' });
            return;
          }
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = buildImageExportFilename(loadedName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
          resolve({ ok: true });
        }, 'image/png');
      } catch {
        URL.revokeObjectURL(url);
        resolve({ ok: false, error: 'export-failed' });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, error: 'export-failed' });
    };

    img.src = url;
  });
}
