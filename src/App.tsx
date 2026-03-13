import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { OverviewPage } from './pages/OverviewPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { SnapshotsPage } from './pages/SnapshotsPage';
import { GroupsPage } from './pages/GroupsPage';
type Page = 'overview' | 'transactions' | 'snapshots' | 'groups';

function AppShell() {
  const [page, setPage] = useState<Page>('overview');

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar activePage={page} onPageChange={p => setPage(p as Page)} />
      <main className="ml-64 flex-1 p-6 max-w-5xl">
        {page === 'overview' && <OverviewPage />}
        {page === 'transactions' && <TransactionsPage />}
        {page === 'snapshots' && <SnapshotsPage />}
        {page === 'groups' && <GroupsPage />}
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
