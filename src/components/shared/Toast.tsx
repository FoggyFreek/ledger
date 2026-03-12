import { X } from 'lucide-react';
import type { ToastMessage } from '../../hooks/useToast';

interface Props {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: Props) {
  if (!toast) return null;

  const colors: Record<string, string> = {
    success: 'bg-green-900 border-green-700 text-green-200',
    info:    'bg-blue-900 border-blue-700 text-blue-200',
    warning: 'bg-yellow-900 border-yellow-700 text-yellow-200',
  };

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 border rounded-lg px-4 py-3 shadow-xl max-w-sm ${colors[toast.type]}`}>
      <span className="text-sm leading-snug">{toast.message}</span>
      <button onClick={onDismiss} className="mt-0.5 shrink-0 opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
