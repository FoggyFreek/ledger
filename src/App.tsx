import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { OverviewPage } from './pages/OverviewPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { SnapshotsPage } from './pages/SnapshotsPage';
import { GroupsPage } from './pages/GroupsPage';
import { TimelinePage } from './pages/TimelinePage';
import { ColonySeasonPage } from './pages/ColonySeasonPage';
type Page = 'overview' | 'transactions' | 'snapshots' | 'groups' | 'timeline' | 'colony';

function AppShell() {
  const [page, setPage] = useState<Page>('overview');
  const isTimeline = page === 'timeline';

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar activePage={page} onPageChange={p => setPage(p as Page)} />
      <main className={`ml-64 flex-1 ${isTimeline ? 'flex flex-col h-screen overflow-hidden' : 'p-6 max-w-5xl'}`}>
        {page === 'overview' && <OverviewPage />}
        {page === 'transactions' && <TransactionsPage />}
        {page === 'snapshots' && <SnapshotsPage />}
        {page === 'groups' && <GroupsPage />}
        {page === 'timeline' && <TimelinePage />}
        {page === 'colony' && <ColonySeasonPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
