import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export function ErrorBanner({ message, details }: { message: string; details?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span className="flex-1">{message}</span>
        {details && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="shrink-0 text-red-400 hover:text-red-200 flex items-center gap-1 text-xs cursor-pointer"
          >
            {expanded ? 'Hide' : 'Details'}
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>
      {details && expanded && (
        <pre className="mt-2 text-xs text-red-400 whitespace-pre-wrap break-all border-t border-red-800 pt-2">
          {details}
        </pre>
      )}
    </div>
  );
}
