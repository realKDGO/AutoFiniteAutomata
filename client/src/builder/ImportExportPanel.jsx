import { useRef } from 'react';
import { Download, Upload, Image as ImageIcon } from 'lucide-react';
import Button from '../components/ui/Button';

/**
 * JSON Import/Export & Image Export UI (V2.3.4). Purely presentational, like
 * SavedAutomataPanel — all serialization, validation, and image rendering
 * live in BuilderPage, wired through automatonStorage.js and imageExporter.js.
 */
export default function ImportExportPanel({ currentAutomaton, onExport, onExportImage, onImportFile }) {
  const fileInputRef = useRef(null);
  const isEmptyAutomaton = !currentAutomaton?.states || currentAutomaton.states.length === 0;

  const handleFileChange = e => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file again later
    if (file) onImportFile(file);
  };

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Export Diagram
        </label>
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="w-full" disabled={isEmptyAutomaton} onClick={onExportImage}>
            <ImageIcon size={15} /> Export Image (PNG)
          </Button>
          <Button variant="secondary" className="w-full" disabled={isEmptyAutomaton} onClick={onExport}>
            <Download size={15} /> Export JSON File
          </Button>
        </div>
        {isEmptyAutomaton && (
          <p className="text-xs text-ink-soft">Add at least one state before exporting.</p>
        )}
      </div>

      <div className="space-y-2 border-t border-line pt-4 dark:border-line-dark">
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Import Automaton
        </label>
        <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()}>
          <Upload size={15} /> Choose JSON File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
        <p className="text-xs text-ink-soft">
          Importing will replace your current Builder automaton.
        </p>
      </div>
    </div>
  );
}
