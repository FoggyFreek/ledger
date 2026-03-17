import type { TaxCategory } from '../../types/transaction';
import { CATEGORY_LABEL, CATEGORY_BADGE_STYLE } from '../../lib/categoryMeta';

export function CategoryBadge({ category }: { category: TaxCategory }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_BADGE_STYLE[category]}`}>
      {CATEGORY_LABEL[category]}
    </span>
  );
}
