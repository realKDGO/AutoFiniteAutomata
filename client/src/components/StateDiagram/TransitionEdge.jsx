export default function TransitionEdge({ edge, geometry, active }) {
  const activeEdge = edge.labels.some(label =>
    active.has(`${edge.from}\0${edge.to}\0${label}`)
  );
  const color = activeEdge ? 'var(--diagram-active)' : 'var(--diagram-edge)';
  const labelWidth = Math.max(34, edge.label.length * 7.2);

  // Show ε correctly for epsilon transitions
  const displayLabel = edge.label;

  return (
    <g>
      <title>{`Transition from ${edge.from} to ${edge.to} on input ${displayLabel}`}</title>

      {/* Wider invisible hit target for usability */}
      <path
        d={geometry.path}
        fill="none"
        stroke="transparent"
        strokeWidth="10"
      />

      {/* Visible arrow */}
      <path
        d={geometry.path}
        fill="none"
        stroke={color}
        strokeWidth={activeEdge ? 2.8 : 1.7}
        markerEnd="url(#autofa-arrowhead)"
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
        fill={color}
        className="text-[11px] font-medium"
      >
        {displayLabel}
      </text>
    </g>
  );
}