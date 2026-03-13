import { useState } from 'react';
import { Layers } from 'lucide-react';

interface Props {
  memberships: { id: number; name: string }[];
}

export function GroupBadges({ memberships }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (memberships.length === 0) return null;

  if (memberships.length <= 2) {
    return (
      <span className="flex flex-wrap gap-1 mt-0.5">
        {memberships.map(m => (
          <span key={m.id} className="bg-purple-800 text-purple-200 text-xs rounded px-1">
            {m.name}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1 mt-0.5">
      {expanded ? (
        memberships.map(m => (
          <span key={m.id} className="bg-purple-800 text-purple-200 text-xs rounded px-1">
            {m.name}
          </span>
        ))
      ) : (
        <button
          onClick={e => { e.stopPropagation(); setExpanded(true); }}
          className="flex items-center gap-0.5 bg-purple-800 text-purple-200 text-xs rounded px-1 hover:bg-purple-700"
        >
          <Layers size={10} />
          {memberships.length}
        </button>
      )}
    </span>
  );
}
