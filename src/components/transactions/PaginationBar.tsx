export interface PaginationBarProps {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  setPage: (p: number) => void;
}

export function PaginationBar({ page, totalPages, pageSize, totalItems, setPage }: PaginationBarProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 text-sm">
      <span className="text-gray-500 text-xs">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 text-xs"
        >
          Prev
        </button>
        <span className="text-gray-400 text-xs flex items-center gap-1">
          Page
          <input
            type="number"
            min={1}
            max={totalPages}
            value={page}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) setPage(Math.min(totalPages, Math.max(1, v)));
            }}
            className="w-12 text-center bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          / {totalPages}
        </span>
        <button
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 text-xs"
        >
          Next
        </button>
      </div>
    </div>
  );
}
