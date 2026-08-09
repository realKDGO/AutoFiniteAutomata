import { X } from 'lucide-react';

/**
 * Non-blocking floating panel / bottom sheet used for mobile contextual
 * controls (state/transition inspector, Simulator, Transition Table).
 *
 * Unlike Modal, this never covers the whole screen and never traps the user
 * away from the canvas — the Builder remains visible and usable underneath.
 * Only rendered where the caller wraps it with a `lg:hidden` container so
 * desktop keeps its existing side-panel layout untouched.
 */
export default function MobileSheet({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[75vh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-lift dark:border-line-dark dark:bg-surface-dark"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="dialog"
      aria-modal="false"
      aria-label={title}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-line-dark">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        <button
          type="button"
          className="focus-ring rounded-lg p-1.5 text-ink-soft hover:bg-primary-soft hover:text-primary"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}
