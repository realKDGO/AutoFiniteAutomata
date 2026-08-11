const SIM_COLORS = {
  yellow: '#f59e0b',
  green:  '#10b981',
  red:    '#ef4444',
};

export default function StateNode({ state, point, accepting, dead, active, simCurrent, simColor = 'yellow' }) {
  // Preserve permanent state node fill & stroke (normal, active, dead)
  const stroke = active
    ? 'var(--diagram-active)'
    : dead
      ? 'var(--diagram-dead)'
      : 'var(--diagram-stroke)';

  const fill = active
    ? 'var(--diagram-active-soft)'
    : dead
      ? 'var(--diagram-dead-soft)'
      : 'var(--diagram-node)';

  const ringColor = SIM_COLORS[simColor] ?? '#f59e0b';

  return (
    <g>
      <title>{`State ${state}${accepting ? ', accepting state' : ''}${dead ? ', dead state' : ''}${simCurrent ? ', current simulation state' : ''}`}</title>

      {/* Accepting double-ring */}
      {accepting && (
        <circle cx={point.x} cy={point.y} r="36" fill="none" stroke={stroke} strokeWidth="2" />
      )}

      {/* Simulation active-state dashed indicator ring (rendered around state circle) */}
      {simCurrent && (
        <circle
          cx={point.x}
          cy={point.y}
          r="42"
          fill="none"
          stroke={ringColor}
          strokeWidth="3.5"
          strokeDasharray="8 4"
          style={{ animation: 'sim-pulse 1.5s linear infinite' }}
        />
      )}

      {/* Main state circle */}
      <circle
        cx={point.x}
        cy={point.y}
        r="32"
        fill={fill}
        stroke={stroke}
        strokeWidth={active ? 3 : 2}
      />

      <text
        x={point.x}
        y={point.y + 5}
        textAnchor="middle"
        fill="var(--diagram-text)"
        className="text-[13px] font-semibold"
      >
        {state}
      </text>
    </g>
  );
}