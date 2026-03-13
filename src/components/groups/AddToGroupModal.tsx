import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { loadGroups, createGroup, addGroupMembers } from '../../lib/storage';
import { computeUsdValues } from '../../lib/groups';
import type { ParsedTransaction } from '../../types/transaction';
import type { TransactionGroup } from '../../types/groups';

interface Props {
  transactions: ParsedTransaction[];
  walletAddress: string;
  onClose: () => void;
  onSaved: (groupName: string, count: number) => void;
}

export function AddToGroupModal({ transactions, walletAddress, onClose, onSaved }: Props) {
  const [groups, setGroups] = useState<TransactionGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | 'new' | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    loadGroups(walletAddress).then(gs => {
      setGroups(gs);
      if (gs.length === 0) setSelectedGroupId('new');
    });
  }, [walletAddress]);

  const confirm = async () => {
    if (selectedGroupId === null) { setErr('Select a group'); return; }
    if (selectedGroupId === 'new' && !newGroupName.trim()) { setErr('Enter a group name'); return; }
    setSaving(true);
    setErr('');
    try {
      const members = await computeUsdValues(transactions);
      let groupId: number;
      let groupName: string;
      if (selectedGroupId === 'new') {
        const created = await createGroup(walletAddress, newGroupName.trim());
        if (!created) { setErr('Failed to create group'); setSaving(false); return; }
        groupId = created.id;
        groupName = created.name;
      } else {
        groupId = selectedGroupId;
        groupName = groups.find(g => g.id === selectedGroupId)?.name ?? String(selectedGroupId);
      }
      await addGroupMembers(walletAddress, groupId, members);
      onSaved(groupName, transactions.length);
    } catch {
      setErr('Something went wrong');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Add {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} to Group
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {groups.length > 0 && (
            <div>
              <label className="block text-sm text-gray-300 mb-1">Existing group</label>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {groups.map(g => (
                  <label key={g.id} className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-gray-800">
                    <input
                      type="radio"
                      name="group"
                      value={g.id}
                      checked={selectedGroupId === g.id}
                      onChange={() => setSelectedGroupId(g.id)}
                      className="accent-purple-500"
                    />
                    <span className="text-sm text-white">{g.name}</span>
                    <span className="text-xs text-gray-500">{g.txCount} txns</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-gray-800">
            <input
              type="radio"
              name="group"
              value="new"
              checked={selectedGroupId === 'new'}
              onChange={() => setSelectedGroupId('new')}
              className="accent-purple-500"
            />
            <span className="text-sm text-white">New group…</span>
          </label>

          {selectedGroupId === 'new' && (
            <input
              type="text"
              value={newGroupName}
              onChange={e => { setNewGroupName(e.target.value); setErr(''); }}
              placeholder="Group name"
              autoFocus
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          )}

          {err && <p className="text-red-400 text-sm">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={confirm}
              disabled={saving}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            >
              {saving ? 'Fetching prices…' : 'Add to Group'}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
