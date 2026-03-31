import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorBanner } from '../shared/ErrorBanner';

export function CreateSnapshotModal({
  onClose,
  onCreate,
  creating,
  error,
  isComplete,
}: {
  onClose: () => void;
  onCreate: (label: string, date: Date) => void;
  creating: boolean;
  error: string | null;
  isComplete: boolean;
}) {
  const [label, setLabel] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('00:00');

  const submit = () => {
    if (!dateStr) return;
    const d = new Date(`${dateStr}T${timeStr}:00`);
    onCreate(label.trim() || `Snapshot ${format(d, 'yyyy-MM-dd HH:mm')}`, d);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold text-white mb-4">Create Snapshot</h2>

        {!isComplete && (
          <div className="flex items-start gap-2 bg-yellow-950/50 border border-yellow-800/50 rounded-lg p-3 mb-4 text-xs text-yellow-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Full transaction history is not loaded. Snapshot accuracy depends on having all transactions
              fetched. Go to Transactions tab and load all older transactions first for best results.
            </span>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm text-gray-300 block mb-1">Snapshot Date</label>
              <input
                type="date"
                value={dateStr}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={e => setDateStr(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="w-32">
              <label className="text-sm text-gray-300 block mb-1">Time</label>
              <input
                type="time"
                value={timeStr}
                onChange={e => setTimeStr(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-300 block mb-1">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. EOY 2024, Tax Year 2023"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          {error && <ErrorBanner message={error} />}
          <div className="flex gap-2 pt-1">
            <button
              onClick={submit}
              disabled={creating || !dateStr}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            >
              {creating && <LoadingSpinner size={14} />}
              {creating ? 'Creating...' : 'Create Snapshot'}
            </button>
            <button
              onClick={onClose}
              disabled={creating}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
