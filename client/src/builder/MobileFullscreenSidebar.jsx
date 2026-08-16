import { MousePointer, Plus, ArrowUpRight, Table, Play, Save, Download, History } from 'lucide-react';

/**
 * Mobile fullscreen control rail.
 *
 * Renders ONLY inside the fullscreen root (see BuilderCanvas) on mobile
 * viewports, so the entire Builder workflow — tool switching, the
 * Transition Table, and the Simulator — stays reachable without the user
 * ever leaving fullscreen. Desktop keeps its existing toolbar/panels and
 * never renders this component.
 *
 * All state (activeTool, mobile sheet, fullscreen) is owned by BuilderPage /
 * BuilderCanvas — this is purely presentational.
 */
export default function MobileFullscreenSidebar({
  activeTool,
  onSelectTool,
  onAddState,
  onOpenTable,
  onOpenSimulator,
  onOpenSaveLoad,
  onOpenImportExport,
  onOpenHistory,
  activePanel,
}) {
  const tools = [
    {
      key: 'select',
      label: 'Select',
      icon: MousePointer,
      active: activeTool === 'select',
      onClick: () => onSelectTool?.('select'),
    },
    {
      key: 'move',
      label: 'Add State',
      icon: Plus,
      active: activeTool === 'move',
      onClick: () => onAddState?.(),
    },
    {
      key: 'transition',
      label: 'Transition',
      icon: ArrowUpRight,
      active: activeTool === 'transition',
      onClick: () => onSelectTool?.('transition'),
    },
  ];

  return (
    <div
      className="flex w-[76px] shrink-0 flex-col items-stretch gap-1.5 overflow-y-auto border-r border-line bg-surface p-2 dark:border-line-dark dark:bg-surface-dark"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0.5rem)' }}
      role="toolbar"
      aria-label="Mobile fullscreen Builder controls"
    >
      {tools.map(({ key, label, icon: Icon, active, onClick }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={`focus-ring flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-semibold leading-tight ${
            active
              ? 'bg-primary text-white shadow-sm'
              : 'border border-line bg-surface text-ink hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark'
          }`}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}

      <div className="my-1 h-px w-full bg-line dark:bg-line-dark" />

      <button
        type="button"
        onClick={() => onOpenTable?.()}
        aria-label="Open transition table"
        aria-pressed={activePanel === 'table'}
        className={`focus-ring flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border py-2 text-[10px] font-semibold leading-tight ${activePanel === 'table' ? 'border-primary bg-primary text-white shadow-sm' : 'border-line bg-surface text-ink hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark'}`}
      >
        <Table size={18} />
        Table
      </button>

      <button
        type="button"
        onClick={() => onOpenSimulator?.()}
        aria-label="Open simulator"
        aria-pressed={activePanel === 'simulator'}
        className={`focus-ring flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border py-2 text-[10px] font-semibold leading-tight ${activePanel === 'simulator' ? 'border-primary bg-primary text-white shadow-sm' : 'border-line bg-surface text-ink hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark'}`}
      >
        <Play size={18} />
        Sim
      </button>

      <button
        type="button"
        onClick={() => onOpenSaveLoad?.()}
        aria-label="Open Save / Load"
        aria-pressed={activePanel === 'savedAutomata'}
        className={`focus-ring flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border py-2 text-[10px] font-semibold leading-tight ${activePanel === 'savedAutomata' ? 'border-primary bg-primary text-white shadow-sm' : 'border-line bg-surface text-ink hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark'}`}
      >
        <Save size={18} />
        Save
      </button>

      <button
        type="button"
        onClick={() => onOpenImportExport?.()}
        aria-label="Open Import / Export"
        aria-pressed={activePanel === 'importExport'}
        className={`focus-ring flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border py-2 text-[10px] font-semibold leading-tight ${activePanel === 'importExport' ? 'border-primary bg-primary text-white shadow-sm' : 'border-line bg-surface text-ink hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark'}`}
      >
        <Download size={18} />
        Import
      </button>

      <button
        type="button"
        onClick={() => onOpenHistory?.()}
        aria-label="Open Simulation History"
        aria-pressed={activePanel === 'simulationHistory'}
        className={`focus-ring flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border py-2 text-[10px] font-semibold leading-tight ${activePanel === 'simulationHistory' ? 'border-primary bg-primary text-white shadow-sm' : 'border-line bg-surface text-ink hover:bg-primary-soft dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark'}`}
      >
        <History size={18} />
        History
      </button>

    </div>
  );
}
