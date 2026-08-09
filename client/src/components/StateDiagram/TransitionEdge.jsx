export function getArrowColor(edge, alphabet = ['0', '1']) {
  const symbols = edge.labels ?? [];
  
  // Get index of symbol in alphabet if provided, else rely on symbol string checks
  const getSymbolIndex = (sym) => {
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

  // Blue for looping (contains both 1st and 2nd symbol, e.g. 0 & 1 or A & B)
  if (indices.has(0) && indices.has(1)) {
    return { name: 'blue', hex: '#3b82f6' };
  }

  // Check lowest index symbol present if single or single-category
  if (indices.has(0)) return { name: 'red', hex: '#ef4444' };
  if (indices.has(1)) return { name: 'green', hex: '#22c55e' };
  if (indices.has(2)) return { name: 'cyan', hex: '#06b6d4' };
  if (indices.has(3)) return { name: 'magenta', hex: '#d946ef' };
  if (indices.has(4)) return { name: 'yellow', hex: '#eab308' };

  return { name: 'default', hex: '#607083' };
}

export default function TransitionEdge({ edge, geometry, active, alphabet }) {
  const activeEdge = edge.labels.some(label =>
    active.has(`${edge.from}\0${edge.to}\0${label}`)
  );

  const edgeColorInfo = getArrowColor(edge, alphabet);
  const strokeColor = activeEdge ? '#1683d8' : edgeColorInfo.hex;
  const markerId = activeEdge ? 'autofa-arrowhead' : `autofa-arrowhead-${edgeColorInfo.name}`;
  const labelWidth = Math.max(34, edge.label.length * 7.2);

  // Show ε correctly for epsilon transitions
  const displayLabel = edge.label;

  return (
    <g>
      <title>{`Transition from ${edge.from} to ${edge.to} on input ${displayLabel}`}</title>

      {/* Wider invisible hit target for usability — covers body + arrowhead */}
      <path
        d={geometry.path}
        fill="none"
        stroke="transparent"
        strokeWidth="18"
        strokeLinecap="round"
        pointerEvents="stroke"
      />

      {/* Small extra hit circle right at the arrow tip */}
      <circle
        cx={geometry.end?.x ?? geometry.label.x}
        cy={geometry.end?.y ?? geometry.label.y}
        r="10"
        fill="transparent"
        pointerEvents="all"
      />

      {/* Visible arrow */}
      <path
        d={geometry.path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={activeEdge ? 2.8 : 2}
        markerEnd={`url(#${markerId})`}
      />

      {/* Label pill */}
      <rect
        x={geometry.label.x - labelWidth / 2}
        y={geometry.label.y - 12}
        width={labelWidth}
        height={18}
        rx={5}
        fill="var(--diagram-label)"
      />
      <text
        x={geometry.label.x}
        y={geometry.label.y + 1}
        textAnchor="middle"
        fill={strokeColor}
        className="text-[11px] font-medium"
      >
        {displayLabel}
      </text>
    </g>
  );
}