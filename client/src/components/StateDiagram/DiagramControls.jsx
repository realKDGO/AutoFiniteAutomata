import { Minus, Plus, RotateCcw } from 'lucide-react';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const STEP = 0.1;

export default function DiagramControls({ zoom, onZoom, onReset }) {
  const change = amount =>
    onZoom(Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + amount)).toFixed(2)));

  return (
    <div className="flex items-center gap-1" aria-label="Diagram zoom controls">
      <button
        className="focus-ring rounded-lg border border-line bg-surface p-2 text-ink-muted hover:bg-primary-soft hover:text-primary dark:border-line-dark dark:bg-surface-dark"
        onClick={() => change(-STEP)}
        disabled={zoom <= MIN_ZOOM}
        aria-label="Zoom out"
      >
        <Minus size={16} />
      </button>

      <output
        className="min-w-[3.5rem] text-center text-sm font-semibold text-ink dark:text-ink-dark"
        aria-live="polite"
      >
        {Math.round(zoom * 100)}%
      </output>

      <button
        className="focus-ring rounded-lg border border-line bg-surface p-2 text-ink-muted hover:bg-primary-soft hover:text-primary dark:border-line-dark dark:bg-surface-dark"
        onClick={() => change(STEP)}
        disabled={zoom >= MAX_ZOOM}
        aria-label="Zoom in"
      >
        <Plus size={16} />
      </button>

      <button
        className="focus-ring ml-1 rounded-lg border border-line bg-surface p-2 text-ink-muted hover:bg-primary-soft hover:text-primary dark:border-line-dark dark:bg-surface-dark"
        onClick={onReset}
        aria-label="Reset diagram zoom"
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
}