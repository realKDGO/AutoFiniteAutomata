export function getArrowColor(edge, alphabet = ['0', '1']) {
  const symbols = edge.labels ?? [];

  const getSymbolIndex = sym => {
    const idx = alphabet.indexOf(sym);
    if (idx !== -1) return idx;
    if (sym === '0' || sym === 'a' || sym === 'A') return 0;
    if (sym === '1' || sym === 'b' || sym === 'B') return 1;
    if (sym === '2' || sym === 'c' || sym === 'C') return 2;
    if (sym === '3' || sym === 'd' || sym === 'D') return 3;
    if (sym === '4' || sym === 'e' || sym === 'E') return 4;
    return 5;
  };

  const indices = new Set(symbols.map(getSymbolIndex));

  if (indices.has(0) && indices.has(1)) return { name: 'blue',    hex: '#3b82f6' };
  if (indices.has(0)) return { name: 'red',     hex: '#ef4444' };
  if (indices.has(1)) return { name: 'green',   hex: '#22c55e' };
  if (indices.has(2)) return { name: 'cyan',    hex: '#06b6d4' };
  if (indices.has(3)) return { name: 'magenta', hex: '#d946ef' };
  if (indices.has(4)) return { name: 'yellow',  hex: '#eab308' };
  return { name: 'default', hex: '#607083' };
}

/**
 * @param {object}   props
 * @param {object}   props.edge                   — edge data
 * @param {object}   props.geometry               — { path, label, start, end }
 * @param {Set}      props.active                 — editor-selection active set
 * @param {string[]} props.alphabet
 * @param {boolean}  [props.simActive]            — true while transition is animated by simulator
 * @param {Function} [props.onEndpointPointerDown] — callback for initiating endpoint drag
 */
export default function TransitionEdge({ edge, geometry, active, alphabet, simActive = false, onEndpointPointerDown }) {
  const activeEdge = edge.labels.some(label =>
    active.has(`${edge.from}\0${edge.to}\0${label}`)
  );

  const edgeColorInfo = getArrowColor(edge, alphabet);

  const strokeColor = simActive
    ? '#f59e0b'
    : activeEdge
      ? '#1683d8'
      : edgeColorInfo.hex;

  // Select matching arrowhead marker so the arrowhead fill matches strokeColor!
  const markerId = simActive
    ? 'autofa-arrowhead-sim'
    : activeEdge
      ? 'autofa-arrowhead-selected'
      : `autofa-arrowhead-${edgeColorInfo.name}`;

  const strokeWidth = simActive ? 3.5 : activeEdge ? 2.8 : 2;
  const labelWidth  = Math.max(34, edge.label.length * 7.2);

  return (
    <g>
      <title>{`Transition from ${edge.from} to ${edge.to} on input ${edge.label}`}</title>

      {/* Wider invisible hit target for edge body */}
      <path
        d={geometry.path}
        fill="none"
        stroke="transparent"
        strokeWidth="18"
        strokeLinecap="round"
        pointerEvents="stroke"
      />

      {/* Invisible hit target circle at arrow tip for initiating endpoint drag */}
      <circle
        cx={geometry.end?.x ?? geometry.label.x}
        cy={geometry.end?.y ?? geometry.label.y}
        r="12"
        fill="transparent"
        pointerEvents="all"
        onPointerDown={onEndpointPointerDown}
      />

      {/* Simulation glow layer (amber halo beneath active transition arrow) */}
      {simActive && (
        <path
          d={geometry.path}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="9"
          strokeLinecap="round"
          opacity="0.3"
          pointerEvents="none"
        />
      )}

      {/* Visible arrow (markerEnd arrowhead fill ALWAYS matches strokeColor!) */}
      <path
        d={geometry.path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        markerEnd={`url(#${markerId})`}
      />

      {/* Label pill */}
      <rect
        x={geometry.label.x - labelWidth / 2}
        y={geometry.label.y - 12}
        width={labelWidth}
        height={18}
        rx={5}
        fill={simActive ? '#fef3c7' : 'var(--diagram-label)'}
      />
      <text
        x={geometry.label.x}
        y={geometry.label.y + 1}
        textAnchor="middle"
        fill={strokeColor}
        className="text-[11px] font-medium"
      >
        {edge.label}
      </text>
    </g>
  );
}