const MARKER_COLORS = {
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  magenta: '#d946ef',
  yellow: '#eab308',
  default: '#607083',
};

export default function ArrowMarker() {
  return (
    <>
      <marker id="autofa-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#607083" className="dark:fill-[#a9b7c6]" />
      </marker>
      {Object.entries(MARKER_COLORS).map(([colorKey, hex]) => (
        <marker
          key={colorKey}
          id={`autofa-arrowhead-${colorKey}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={hex} />
        </marker>
      ))}
    </>
  );
}