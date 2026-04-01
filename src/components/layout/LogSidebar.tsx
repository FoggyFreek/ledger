import { useState, useEffect } from 'react';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
type LogType  = 'http' | 'external' | 'db';

interface LogEntry {
  timestamp:    string;
  level:        LogLevel;
  type:         LogType;
  method?:      string;
  path:         string;
  target?:      string;
  status_code?: number;
  duration_ms?: number;
  message?:     string;
}

type LevelFilter = 'ALL' | LogLevel;

const LEVEL_TABS: LevelFilter[] = ['ALL', 'INFO', 'WARN', 'ERROR'];

const levelColor: Record<LogLevel, string> = {
  DEBUG: 'text-gray-500',
  INFO:  'text-gray-400',
  WARN:  'text-yellow-400',
  ERROR: 'text-red-400',
};

const levelTabActive: Record<string, string> = {
  ALL:   'bg-gray-700 text-white',
  INFO:  'bg-gray-700 text-gray-200',
  WARN:  'bg-yellow-900/60 text-yellow-300',
  ERROR: 'bg-red-900/60 text-red-300',
};

function statusColor(code?: number): string {
  if (!code) return 'text-gray-500';
  if (code >= 500) return 'text-red-400';
  if (code >= 400) return 'text-yellow-400';
  return 'text-green-500';
}

function typeLabel(entry: LogEntry): string {
  if (entry.type === 'external') return entry.target ?? 'ext';
  if (entry.type === 'db') return 'db';
  return 'http';
}

function typeBadgeColor(entry: LogEntry): string {
  if (entry.type === 'external') return 'bg-blue-900/50 text-blue-300';
  if (entry.type === 'db') return 'bg-red-900/50 text-red-300';
  return 'bg-gray-800 text-gray-400';
}

export function LogSidebar() {
  const [isOpen, setIsOpen]       = useState(false);
  const [entries, setEntries]     = useState<LogEntry[]>([]);
  const [filter, setFilter]       = useState<LevelFilter>('ALL');
  const [search, setSearch]       = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const fetchLogs = () =>
      fetch('/api/v1/logs')
        .then(r => r.json())
        .then((data: LogEntry[]) => setEntries(data))
        .catch(() => {});

    fetchLogs();
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, [isOpen]);

  const visible = [...entries]
    .reverse()
    .filter(e => e.path !== '/api/v1/logs')
    .filter(e => filter === 'ALL' || e.level === filter)
    .filter(e => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        e.path.toLowerCase().includes(q) ||
        (e.message ?? '').toLowerCase().includes(q) ||
        (e.target ?? '').toLowerCase().includes(q)
      );
    });

  return (
    <>
      {/* Toggle tab — always visible on right edge */}
      <button
        style={{ writingMode: 'vertical-rl' }}
        onClick={() => setIsOpen(o => !o)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 border-r-0 rounded-l px-1.5 py-3 text-xs tracking-widest uppercase transition-colors"
        title={isOpen ? 'Close log panel' : 'Open log panel'}
      >
        {isOpen ? 'Close' : 'Logs'}
      </button>

      {/* Slide-in panel */}
      <aside
        className={`fixed right-0 top-0 h-screen w-80 bg-gray-900 border-l border-gray-800 flex flex-col z-40 transition-transform duration-200 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">API Logs</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{entries.length} entries</span>
              <button
                onClick={() => fetch('/api/v1/logs', { method: 'DELETE' }).then(() => setEntries([]))}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                title="Clear logs"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Level filter tabs */}
          <div className="flex gap-1 mb-2">
            {LEVEL_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filter === tab ? levelTabActive[tab] : 'text-gray-500 hover:text-gray-300'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search path or message…"
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono">
          {visible.length === 0 && (
            <p className="text-xs text-gray-600 text-center mt-8">No entries</p>
          )}
          {visible.map((e, i) => (
            <div key={i} className="text-xs leading-relaxed border-b border-gray-800/50 pb-1 pt-0.5">
              {/* Row 1: time + level + type badge */}
              <div className="flex items-center gap-1.5">
                <span className="text-gray-600 shrink-0">{e.timestamp.slice(11, 23)}</span>
                <span className={`font-semibold shrink-0 ${levelColor[e.level]}`}>{e.level}</span>
                <span className={`px-1 rounded text-[10px] shrink-0 ${typeBadgeColor(e)}`}>{typeLabel(e)}</span>
                {e.method && <span className="text-blue-400 shrink-0">{e.method}</span>}
                {e.status_code != null && (
                  <span className={`shrink-0 ${statusColor(e.status_code)}`}>{e.status_code}</span>
                )}
                {e.duration_ms != null && (
                  <span className="text-gray-600 shrink-0">{e.duration_ms}ms</span>
                )}
              </div>
              {/* Row 2: path or message */}
              <div className="text-gray-400 break-all pl-0.5">
                {e.message ?? e.path}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
