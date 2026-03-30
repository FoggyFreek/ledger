import { useState, useRef, useEffect } from 'react';
import type { TaxCategory } from '../../types/transaction';
import { ALL_CATEGORIES, CATEGORY_LABEL, CATEGORY_BADGE_STYLE } from '../../lib/categoryMeta';

interface Props {
  category: TaxCategory;
  onChangeCategory?: (category: TaxCategory) => void;
}

export function CategoryBadge({ category, onChangeCategory }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!onChangeCategory) {
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_BADGE_STYLE[category]}`}>
        {CATEGORY_LABEL[category]}
      </span>
    );
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:ring-1 hover:ring-gray-500 ${CATEGORY_BADGE_STYLE[category]}`}
      >
        {CATEGORY_LABEL[category]}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[140px] max-h-64 overflow-y-auto">
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                if (cat !== category) onChangeCategory(cat);
                setOpen(false);
              }}
              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${
                cat === category ? 'text-white font-semibold' : 'text-gray-300'
              }`}
            >
              <span className={`inline-block px-1.5 py-0.5 rounded mr-2 ${CATEGORY_BADGE_STYLE[cat]}`}>
                {CATEGORY_LABEL[cat]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
