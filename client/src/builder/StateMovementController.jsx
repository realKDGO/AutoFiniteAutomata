import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight, RefreshCw, X } from 'lucide-react';

// Tap = one immediate step. Hold = an immediate step, then (after a short
// delay so a tap never accidentally triggers continuous movement) a steady
// stream of smaller steps until released. Values are in automaton/SVG units,
// independent of canvas zoom — the buttons are UI elements, the movement
// happens in the automaton's own coordinate space (see BuilderCanvas, which
// owns clamping to the canvas bounds).
const TAP_STEP = 14;
const CONTINUOUS_STEP = 6;
const CONTINUOUS_TICK_MS = 35;
const REPEAT_DELAY_MS = 300;

const CARDINAL = [
  { id: 'up', label: 'Up', icon: ArrowUp, dx: 0, dy: -1, area: 'up' },
  { id: 'left', label: 'Left', icon: ArrowLeft, dx: -1, dy: 0, area: 'left' },
  { id: 'right', label: 'Right', icon: ArrowRight, dx: 1, dy: 0, area: 'right' },
  { id: 'down', label: 'Down', icon: ArrowDown, dx: 0, dy: 1, area: 'down' },
];

const DIAGONAL = [
  { id: 'up-left', label: 'Up-left', icon: ArrowUpLeft, dx: -1, dy: -1, area: 'tl' },
  { id: 'up-right', label: 'Up-right', icon: ArrowUpRight, dx: 1, dy: -1, area: 'tr' },
  { id: 'down-left', label: 'Down-left', icon: ArrowDownLeft, dx: -1, dy: 1, area: 'bl' },
  { id: 'down-right', label: 'Down-right', icon: ArrowDownRight, dx: 1, dy: 1, area: 'br' },
];

function DirectionButton({ dir, onMove, gridArea }) {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove; // always call the latest onMove, never a stale closure

  const repeatTimeoutRef = useRef(null);
  const continuousIntervalRef = useRef(null);
  const [pressed, setPressed] = useState(false);

  const magnitude = dir.dx !== 0 && dir.dy !== 0 ? 1 / Math.SQRT2 : 1; // normalize diagonals

  const stop = () => {
    clearTimeout(repeatTimeoutRef.current);
    clearInterval(continuousIntervalRef.current);
    repeatTimeoutRef.current = null;
    continuousIntervalRef.current = null;
    setPressed(false);
  };

  const start = e => {
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerId != null && e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore — capture is a reliability improvement, not a requirement
      }
    }
    setPressed(true);
    onMoveRef.current(dir.dx * TAP_STEP * magnitude, dir.dy * TAP_STEP * magnitude);
    repeatTimeoutRef.current = setTimeout(() => {
      continuousIntervalRef.current = setInterval(() => {
        onMoveRef.current(dir.dx * CONTINUOUS_STEP * magnitude, dir.dy * CONTINUOUS_STEP * magnitude);
      }, CONTINUOUS_TICK_MS);
    }, REPEAT_DELAY_MS);
  };

  // Stop on unmount (e.g. the controller closes mid-hold) so a stray
  // interval never keeps moving a state after the button is gone.
  useEffect(() => stop, []);

  const Icon = dir.icon;
  return (
    <button
      type="button"
      aria-label={dir.label}
      style={{ gridArea }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      className={`focus-ring flex h-14 w-14 touch-none items-center justify-center rounded-xl border transition ${
        pressed
          ? 'border-primary bg-primary text-white'
          : 'border-line bg-surface text-ink hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark'
      }`}
    >
      <Icon size={22} />
    </button>
  );
}

export default function StateMovementController({ stateName, onMove, onClose }) {
  const [mode, setMode] = useState('cardinal');
  // Mount at translate-x-full, then flip to translate-x-0 a tick later so
  // the panel actually slides in from the right instead of just appearing.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const directions = mode === 'cardinal' ? CARDINAL : DIAGONAL;

  return (
    <div
      role="group"
      aria-label={`Move state ${stateName ?? ''}`}
      className={`fixed right-3 top-1/2 z-[60] w-[13.5rem] -translate-y-1/2 rounded-2xl border border-line bg-surface p-3 shadow-lift transition-transform duration-300 ease-out dark:border-line-dark dark:bg-surface-dark ${
        entered ? 'translate-x-0' : 'translate-x-[120%]'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0.75rem)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink dark:text-ink-dark">
            Moving {stateName}
          </p>
          <p className="text-[11px] text-ink-muted dark:text-ink-darkMuted">
            Move: {mode === 'cardinal' ? 'Cardinal' : 'Diagonal'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close movement controller"
          className="focus-ring rounded-lg p-1.5 text-ink-soft hover:bg-primary-soft hover:text-primary dark:hover:bg-primary/15"
        >
          <X size={16} />
        </button>
      </div>

      <div
        className="mx-auto mt-3 grid h-[11.5rem] w-[11.5rem] gap-1.5"
        style={{
          gridTemplateAreas: `"tl up tr" "left center right" "bl down br"`,
          gridTemplateColumns: 'auto auto auto',
          gridTemplateRows: 'auto auto auto',
        }}
      >
        {directions.map(dir => (
          <DirectionButton key={dir.id} dir={dir} gridArea={dir.area} onMove={onMove} />
        ))}

        <button
          type="button"
          style={{ gridArea: 'center' }}
          onClick={() => setMode(m => (m === 'cardinal' ? 'diagonal' : 'cardinal'))}
          aria-label={`Switch to ${mode === 'cardinal' ? 'diagonal' : 'cardinal'} movement mode`}
          className="focus-ring flex h-14 w-14 items-center justify-center rounded-xl border border-primary/40 bg-primary-soft text-primary dark:bg-primary/15 dark:text-sky-300"
        >
          <RefreshCw size={18} />
        </button>
      </div>
    </div>
  );
}
