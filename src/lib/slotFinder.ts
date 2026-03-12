import { getBlockTime, getCurrentSlot } from './helius';

const SLOT_CACHE = new Map<number, number>();

async function cachedBlockTime(slot: number): Promise<number | null> {
  if (SLOT_CACHE.has(slot)) return SLOT_CACHE.get(slot)!;
  const t = await getBlockTime(slot);
  if (t !== null) SLOT_CACHE.set(slot, t);
  return t;
}

// Estimate slot for a given unix timestamp (seconds)
export async function findSlotForTimestamp(targetTs: number): Promise<number> {
  const currentSlot = await getCurrentSlot();
  const currentTs = await cachedBlockTime(currentSlot);
  if (!currentTs) throw new Error('Could not get current block time');

  // Solana produces ~2.5 slots/sec
  const SLOTS_PER_SEC = 2.5;
  const diff = currentTs - targetTs;
  const estimatedSlot = Math.max(0, Math.floor(currentSlot - diff * SLOTS_PER_SEC));

  // Binary search to converge
  let lo = Math.max(0, estimatedSlot - 50000);
  let hi = currentSlot;

  for (let i = 0; i < 25; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const t = await cachedBlockTime(mid);
    if (t === null) {
      // slot might have been skipped — adjust
      lo = mid + 1;
      continue;
    }
    if (t < targetTs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
    if (hi - lo <= 1) break;
  }

  return lo;
}
