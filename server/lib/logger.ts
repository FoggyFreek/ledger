export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogType  = 'http' | 'external' | 'db';

export interface LogEntry {
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

const BUFFER_SIZE = 100;
const buffer: (LogEntry | undefined)[] = new Array(BUFFER_SIZE).fill(undefined);
let head  = 0;  // next write slot
let count = 0;  // total written, capped at BUFFER_SIZE

export function writeLog(entry: LogEntry): void {
  buffer[head] = entry;
  head = (head + 1) % BUFFER_SIZE;
  if (count < BUFFER_SIZE) count++;
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export function clearLogs(): void {
  buffer.fill(undefined);
  head  = 0;
  count = 0;
}

/** Resets buffer state — only for use in tests. */
export function _resetForTesting(): void {
  clearLogs();
}

/** Returns up to 100 entries in chronological order (oldest first). */
export function getRecentLogs(): LogEntry[] {
  if (count < BUFFER_SIZE) {
    return (buffer.slice(0, count) as LogEntry[]);
  }
  // Buffer has wrapped: head points to the oldest slot.
  return [
    ...(buffer.slice(head) as LogEntry[]),
    ...(buffer.slice(0, head) as LogEntry[]),
  ];
}
