import { Minus, Plus, RotateCcw, Maximize, Minimize, Undo2, Redo2 } from 'lucide-react';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const STEP = 0.1;

export default function DiagramControls({
  zoom,
  onZoom,
  onReset,
  isFullscreen,
  onToggleFullscreen,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) {
  const change = amount =>
    onZoom(Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + amount)).toFixed(2)));

  return (
    <div className="flex items-center gap-1" aria-label="Diagram zoom controls">
      {onUndo && (
        <button
          className="focus-ring rounded-lg border border-line bg-surface p-2 text-ink-muted hover:bg-primary-soft hover:text-primary disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-ink-muted dark:border-line-dark dark:bg-surface-dark"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo action"
          title="Undo"
        >
          <Undo2 size={16} />
        </button>
      )}

      {onRedo && (
        <button
          className="focus-ring rounded-lg border border-line bg-surface p-2 text-ink-muted hover:bg-primary-soft hover:text-primary disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-ink-muted dark:border-line-dark dark:bg-surface-dark"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo action"
          title="Redo"
        >
          <Redo2 size={16} />
        </button>
      )}

      {(onUndo || onRedo) && <div className="mx-1 h-5 w-px bg-line dark:bg-line-dark" />}

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
        title="Reset Zoom"
      >
        <RotateCcw size={16} />
      </button>

      {onToggleFullscreen && (
        <button
          className="focus-ring ml-1 rounded-lg border border-line bg-surface p-2 text-ink-muted hover:bg-primary-soft hover:text-primary dark:border-line-dark dark:bg-surface-dark"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      )}
    </div>
  );
}