interface TxSelectionBarProps {
  selectedCount: number;
  onAddToGroup: () => void;
  onClear: () => void;
}

export function TxSelectionBar({ selectedCount, onAddToGroup, onClear }: TxSelectionBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2">
      <span className="text-sm text-gray-300">{selectedCount} selected</span>
      <button
        onClick={onAddToGroup}
        className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-1 rounded"
      >
        Add to Group
      </button>
      <button
        onClick={onClear}
        className="text-gray-400 hover:text-white text-sm"
      >
        Clear
      </button>
    </div>
  );
}
