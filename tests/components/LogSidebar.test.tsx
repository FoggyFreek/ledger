// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LogSidebar } from '../../src/components/layout/LogSidebar';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LOGS_URL = '/api/v1/logs';

const sampleEntries = [
  {
    timestamp: '2026-04-01T10:00:00.000Z',
    level: 'INFO',
    type: 'http',
    method: 'GET',
    path: '/api/v1/wallets',
    status_code: 200,
    duration_ms: 12,
  },
  {
    timestamp: '2026-04-01T10:00:01.000Z',
    level: 'WARN',
    type: 'external',
    target: 'helius',
    method: 'POST',
    path: '/rpc',
    status_code: 429,
    duration_ms: 840,
  },
  {
    timestamp: '2026-04-01T10:00:02.000Z',
    level: 'ERROR',
    type: 'db',
    path: '/api/v1/transactions',
    message: 'connection refused',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetch(data: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(data),
  } as Response);
}

/** Use when a test doesn't need fetch to resolve — prevents act() warnings. */
function mockFetchPending() {
  global.fetch = vi.fn().mockReturnValue(new Promise<Response>(() => {}));
}

function openSidebar() {
  fireEvent.click(screen.getByTitle('Open log panel'));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ─── Collapsed state ─────────────────────────────────────────────────────────

describe('collapsed (default)', () => {
  it('shows a "Logs" toggle button', () => {
    render(<LogSidebar />);
    expect(screen.getByText('Logs')).toBeTruthy();
  });

  it('does not call fetch while closed', () => {
    mockFetch([]);
    render(<LogSidebar />);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('panel has translate-x-full class (off-screen)', () => {
    render(<LogSidebar />);
    expect(document.querySelector('aside')!.className).toContain('translate-x-full');
  });
});

// ─── Opening the panel ───────────────────────────────────────────────────────

describe('opening the panel', () => {
  it('toggle button changes to "Close"', () => {
    mockFetchPending();
    render(<LogSidebar />);
    openSidebar();
    expect(screen.getByText('Close')).toBeTruthy();
  });

  it('panel loses translate-x-full', () => {
    mockFetchPending();
    render(<LogSidebar />);
    openSidebar();
    expect(document.querySelector('aside')!.className).not.toContain('translate-x-full');
  });

  it('fetches from the correct URL immediately on open', async () => {
    mockFetchPending();
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    expect(global.fetch).toHaveBeenCalledWith(LOGS_URL);
  });

  it('shows "API Logs" header', () => {
    mockFetchPending();
    render(<LogSidebar />);
    openSidebar();
    expect(screen.getByText('API Logs')).toBeTruthy();
  });

  it('shows level filter tabs', () => {
    mockFetchPending();
    render(<LogSidebar />);
    openSidebar();
    for (const tab of ['ALL', 'INFO', 'WARN', 'ERROR']) {
      expect(screen.getByRole('button', { name: tab })).toBeTruthy();
    }
  });
});

// ─── Log entry visibility ────────────────────────────────────────────────────

describe('log entry visibility', () => {
  it('renders paths for http and external entries', async () => {
    mockFetch(sampleEntries);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => {
      expect(screen.getByText('/api/v1/wallets')).toBeTruthy();
      expect(screen.getByText('/rpc')).toBeTruthy();
    });
  });

  it('renders entry levels', async () => {
    mockFetch(sampleEntries);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => screen.getByText('/api/v1/wallets'));
    // Each level appears at least once (tabs + entries)
    expect(screen.getAllByText('INFO').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('WARN').length).toBeGreaterThanOrEqual(2); // tab + entry
    expect(screen.getAllByText('ERROR').length).toBeGreaterThanOrEqual(2); // tab + entry
  });

  it('renders HTTP status codes', async () => {
    mockFetch(sampleEntries);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => {
      expect(screen.getByText('200')).toBeTruthy();
      expect(screen.getByText('429')).toBeTruthy();
    });
  });

  it('renders the target as a type badge for external entries', async () => {
    mockFetch(sampleEntries);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => expect(screen.getByText('helius')).toBeTruthy());
  });

  it('renders message instead of path for db error entries', async () => {
    mockFetch(sampleEntries);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => expect(screen.getByText('connection refused')).toBeTruthy());
  });

  it('shows total entry count in the header', async () => {
    mockFetch(sampleEntries);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => expect(screen.getByText('3 entries')).toBeTruthy());
  });

  it('shows "No entries" when fetch returns an empty array', async () => {
    mockFetch([]);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => expect(screen.getByText('No entries')).toBeTruthy());
  });

  it('renders entries newest-first (most recent at top of list)', async () => {
    mockFetch([
      { timestamp: 'a', level: 'INFO', type: 'http', path: '/first',  status_code: 200, duration_ms: 1 },
      { timestamp: 'b', level: 'INFO', type: 'http', path: '/second', status_code: 200, duration_ms: 1 },
    ]);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => screen.getByText('/second'));

    const log = document.querySelector('.font-mono')!;
    const text = log.textContent ?? '';
    expect(text.indexOf('/second')).toBeLessThan(text.indexOf('/first'));
  });
});

// ─── Level filter ─────────────────────────────────────────────────────────────

describe('level filter tabs', () => {
  async function renderOpen() {
    mockFetch(sampleEntries);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => screen.getByText('/api/v1/wallets'));
  }

  it('ALL tab shows every entry', async () => {
    await renderOpen();
    expect(screen.getByText('/api/v1/wallets')).toBeTruthy();
    expect(screen.getByText('/rpc')).toBeTruthy();
    expect(screen.getByText('connection refused')).toBeTruthy();
  });

  it('WARN tab hides INFO entries and shows WARN entries', async () => {
    await renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'WARN' }));
    expect(screen.queryByText('/api/v1/wallets')).toBeNull();
    expect(screen.getByText('/rpc')).toBeTruthy();
  });

  it('ERROR tab shows only ERROR entries', async () => {
    await renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'ERROR' }));
    expect(screen.queryByText('/api/v1/wallets')).toBeNull();
    expect(screen.queryByText('/rpc')).toBeNull();
    expect(screen.getByText('connection refused')).toBeTruthy();
  });

  it('INFO tab hides WARN and ERROR entries', async () => {
    await renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'INFO' }));
    expect(screen.getByText('/api/v1/wallets')).toBeTruthy();
    expect(screen.queryByText('/rpc')).toBeNull();
    expect(screen.queryByText('connection refused')).toBeNull();
  });

  it('switching back to ALL restores all entries', async () => {
    await renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'WARN' }));
    fireEvent.click(screen.getByRole('button', { name: 'ALL' }));
    expect(screen.getByText('/api/v1/wallets')).toBeTruthy();
    expect(screen.getByText('/rpc')).toBeTruthy();
  });
});

// ─── Search filter ────────────────────────────────────────────────────────────

describe('search filter', () => {
  async function renderOpen() {
    mockFetch(sampleEntries);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => screen.getByText('/api/v1/wallets'));
    return screen.getByPlaceholderText('Search path or message…');
  }

  it('hides entries that do not match the search term', async () => {
    const input = await renderOpen();
    fireEvent.change(input, { target: { value: 'wallets' } });
    expect(screen.getByText('/api/v1/wallets')).toBeTruthy();
    expect(screen.queryByText('/rpc')).toBeNull();
  });

  it('matches by target for external entries', async () => {
    const input = await renderOpen();
    fireEvent.change(input, { target: { value: 'helius' } });
    expect(screen.queryByText('/api/v1/wallets')).toBeNull();
    expect(screen.getByText('/rpc')).toBeTruthy();
  });

  it('matches by message for db error entries', async () => {
    const input = await renderOpen();
    fireEvent.change(input, { target: { value: 'refused' } });
    expect(screen.queryByText('/api/v1/wallets')).toBeNull();
    expect(screen.getByText('connection refused')).toBeTruthy();
  });

  it('is case-insensitive', async () => {
    const input = await renderOpen();
    fireEvent.change(input, { target: { value: 'WALLETS' } });
    expect(screen.getByText('/api/v1/wallets')).toBeTruthy();
  });

  it('shows "No entries" when search matches nothing', async () => {
    const input = await renderOpen();
    fireEvent.change(input, { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No entries')).toBeTruthy();
  });
});

// ─── Polling ──────────────────────────────────────────────────────────────────

describe('polling', () => {
  it('refetches logs every 5 seconds while open', async () => {
    // Only fake setInterval/clearInterval so waitFor's setTimeout still works
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    mockFetch([]);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    vi.advanceTimersByTime(5000);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    vi.advanceTimersByTime(5000);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  });

  it('stops polling after the panel is closed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    mockFetch([]);
    render(<LogSidebar />);
    openSidebar();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Close'));

    vi.advanceTimersByTime(10_000);
    expect(global.fetch).toHaveBeenCalledTimes(1); // no additional calls
  });
});
