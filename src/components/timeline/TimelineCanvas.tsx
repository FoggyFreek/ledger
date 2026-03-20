import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import type { WalletEntry } from '../../types/wallet';
import type { ParsedTransaction } from '../../types/transaction';
import type { TimelineGroup } from '../../types/groups';
import type { TokenMeta } from '../../lib/helius';
import { getCachedTokenInfo } from '../../lib/helius';
import { TxDetail } from '../transactions/TxDetail';
import { ClusterTooltip } from './ClusterTooltip';
import {
  LABEL_WIDTH, ROW_HEIGHT, AXIS_HEIGHT, CLUSTER_THRESHOLD,
  type PlacedEvent, type Cluster, type TransferLine, type HitElement,
  eventRadius, shortAddr,
  drawRow, drawEvent, drawFoldedCluster, drawExpandedCluster,
  drawTransferLines, drawTimeAxis,
} from './timelineDrawing';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveTokenLabel(mint: string, tokenMetas: Map<string, TokenMeta>): string {
  if (mint === 'SOL') return 'SOL';
  const cached = getCachedTokenInfo(mint);
  if (cached) return cached.symbol;
  const fromMap = tokenMetas.get(mint);
  if (fromMap) return fromMap.symbol;
  return mint.slice(0, 6) + '…';
}

function transferLabel(tx: ParsedTransaction, tokenMetas: Map<string, TokenMeta>): string {
  const isOut = tx.taxCategory === 'TRANSFER_OUT';
  const candidates = tx.interpretedFlow.netChanges.filter(b =>
    isOut ? b.amount < 0 : b.amount > 0,
  );
  if (!candidates.length) return '';
  const bc = candidates.reduce((best, b) =>
    Math.abs(b.amount) > Math.abs(best.amount) ? b : best,
  );
  const sym = resolveTokenLabel(bc.mint, tokenMetas);
  const amt = Math.abs(bc.amount);
  const amtStr = amt >= 1000
    ? amt.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : amt.toFixed(amt < 0.01 ? 4 : 2);
  return `${amtStr} ${sym}`;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  wallets: WalletEntry[];
  transactions: Record<string, ParsedTransaction[]>;
  tokenMetas: Map<string, TokenMeta>;
  visibleWallets: Set<string>;
  onToggleWallet: (address: string) => void;
  groups: TimelineGroup[];
  visibleGroups: Set<number>;
  onToggleGroup: (groupId: number) => void;
  onRemoveGroup: (groupId: number) => void;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function TimelineCanvas({
  wallets, transactions, tokenMetas, visibleWallets, onToggleWallet,
  groups, visibleGroups, onToggleGroup, onRemoveGroup,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HitElement[]>([]);
  const dragRef = useRef<{ startX: number; startDateStart: number; startDateEnd: number } | null>(null);

  const now = Math.floor(Date.now() / 1000);
  const [dateStart, setDateStart] = useState(() => now - 365 * 86400);
  const [dateEnd, setDateEnd] = useState(() => now);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [tooltip, setTooltip] = useState<{
    containerX: number; containerY: number; event: PlacedEvent;
  } | null>(null);
  const [clusterTooltip, setClusterTooltip] = useState<{
    containerX: number; containerY: number; cluster: Cluster; walletAddress: string;
  } | null>(null);

  const timeToX = useCallback(
    (t: number) => LABEL_WIDTH + ((t - dateStart) / (dateEnd - dateStart)) * (canvasWidth - LABEL_WIDTH),
    [dateStart, dateEnd, canvasWidth],
  );

  const totalRows = wallets.length + groups.length;

  // ── Compute layout ────────────────────────────────────────────────────────
  const { clustersByRow, transferLines } = useMemo(() => {
    const walletSet = new Set(wallets.map(w => w.address));
    const walletRowMap = new Map<string, number>();
    wallets.forEach((w, i) => walletRowMap.set(w.address, i));

    // Place events — wallets
    const allPlaced: PlacedEvent[] = [];
    wallets.forEach((wallet, rowIndex) => {
      if (!visibleWallets.has(wallet.address)) return;
      const rowY = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
      for (const tx of transactions[wallet.address] ?? []) {
        if (tx.blockTime < dateStart || tx.blockTime > dateEnd) continue;
        if (tx.taxCategory === 'TRANSFER_IN') {
          const total = tx.balanceChanges.reduce((s, bc) => s + Math.abs(bc.amount), 0);
          if (total <= 1e-7) continue;
        }
        const x = LABEL_WIDTH + ((tx.blockTime - dateStart) / (dateEnd - dateStart)) * (canvasWidth - LABEL_WIDTH);
        allPlaced.push({ x, y: rowY, radius: eventRadius(tx), tx, walletAddress: wallet.address, rowIndex });
      }
    });

    // Place events — groups
    groups.forEach((group, gi) => {
      if (!visibleGroups.has(group.id)) return;
      const rowIndex = wallets.length + gi;
      const rowY = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
      for (const tx of group.transactions) {
        if (tx.blockTime < dateStart || tx.blockTime > dateEnd) continue;
        const x = LABEL_WIDTH + ((tx.blockTime - dateStart) / (dateEnd - dateStart)) * (canvasWidth - LABEL_WIDTH);
        allPlaced.push({ x, y: rowY, radius: eventRadius(tx), tx, walletAddress: group.walletAddress, rowIndex });
      }
    });

    // Cluster per row
    const clustersByRow: Cluster[][] = Array.from({ length: totalRows }, () => []);
    for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
      const rowEvents = allPlaced.filter(e => e.rowIndex === rowIndex).sort((a, b) => a.x - b.x);
      if (!rowEvents.length) continue;
      let current: PlacedEvent[] = [rowEvents[0]];
      const flush = () => {
        clustersByRow[rowIndex].push({
          id: `${rowIndex}-${current[0].tx.signature}`,
          events: [...current],
          x1: current[0].x, x2: current[current.length - 1].x,
          y: current[0].y, rowIndex,
        });
      };
      for (let i = 1; i < rowEvents.length; i++) {
        if (rowEvents[i].x - current[current.length - 1].x < CLUSTER_THRESHOLD) {
          current.push(rowEvents[i]);
        } else { flush(); current = [rowEvents[i]]; }
      }
      flush();
    }

    // Transfer lines (wallet-to-wallet only)
    const transferLines: TransferLine[] = [];
    for (const wallet of wallets) {
      if (!visibleWallets.has(wallet.address)) continue;
      for (const tx of transactions[wallet.address] ?? []) {
        if (tx.taxCategory !== 'TRANSFER_OUT') continue;
        if (!tx.counterparty || !walletSet.has(tx.counterparty)) continue;
        if (tx.blockTime < dateStart || tx.blockTime > dateEnd) continue;
        const fromRow = walletRowMap.get(wallet.address);
        const toRow = walletRowMap.get(tx.counterparty);
        if (fromRow === undefined || toRow === undefined || fromRow === toRow) continue;
        const x = LABEL_WIDTH + ((tx.blockTime - dateStart) / (dateEnd - dateStart)) * (canvasWidth - LABEL_WIDTH);
        transferLines.push({
          x,
          fromRowY: fromRow * ROW_HEIGHT + ROW_HEIGHT / 2,
          toRowY: toRow * ROW_HEIGHT + ROW_HEIGHT / 2,
          label: transferLabel(tx, tokenMetas),
          labelY: 0,
        });
      }
    }

    // De-overlap transfer labels
    const LABEL_COLLISION_X = 80;
    const LINE_FRACS = [0.25, 0.5, 0.75];
    const labelSlots: number[] = transferLines.map(() => 1);
    for (let i = 0; i < transferLines.length; i++) {
      const used = new Set<number>();
      for (let j = 0; j < i; j++) {
        if (Math.abs(transferLines[i].x - transferLines[j].x) < LABEL_COLLISION_X) {
          used.add(labelSlots[j]);
        }
      }
      for (let s = 0; s < LINE_FRACS.length; s++) {
        if (!used.has(s)) { labelSlots[i] = s; break; }
      }
    }
    transferLines.forEach((line, i) => {
      const frac = LINE_FRACS[labelSlots[i]];
      line.labelY = line.fromRowY + (line.toRowY - line.fromRowY) * frac;
    });

    return { clustersByRow, transferLines };
  }, [wallets, visibleWallets, transactions, groups, visibleGroups, dateStart, dateEnd, canvasWidth, tokenMetas, totalRows]);

  const canvasHeight = AXIS_HEIGHT + totalRows * ROW_HEIGHT;

  // ── Draw ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const hitElements: HitElement[] = [];

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Wallet rows
    wallets.forEach((wallet, rowIndex) => {
      drawRow(ctx, rowIndex, canvasWidth, wallet.label || shortAddr(wallet.address), visibleWallets.has(wallet.address));
    });

    // Group rows
    groups.forEach((group, gi) => {
      const rowIndex = wallets.length + gi;
      drawRow(ctx, rowIndex, canvasWidth, group.name, visibleGroups.has(group.id));
    });

    // Label separator
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, 0);
    ctx.lineTo(LABEL_WIDTH, canvasHeight - AXIS_HEIGHT);
    ctx.stroke();

    // Transfer lines
    drawTransferLines(ctx, transferLines);

    // Events / clusters
    for (let r = 0; r < totalRows; r++) {
      for (const cluster of clustersByRow[r] ?? []) {
        const isExpanded = expandedClusters.has(cluster.id);
        if (cluster.events.length === 1) {
          drawEvent(ctx, cluster.events[0]);
          hitElements.push({ type: 'event', event: cluster.events[0] });
        } else if (isExpanded) {
          drawExpandedCluster(ctx, cluster);
          for (const ev of cluster.events) {
            drawEvent(ctx, ev);
            hitElements.push({ type: 'event', event: ev });
          }
          hitElements.push({ type: 'cluster', cluster });
        } else {
          drawFoldedCluster(ctx, cluster);
          hitElements.push({ type: 'cluster', cluster });
        }
      }
    }

    // Time axis + now marker
    drawTimeAxis(ctx, canvasWidth, canvasHeight, dateStart, dateEnd, timeToX);

    hitRef.current = hitElements;
  }, [
    dateStart, dateEnd, expandedClusters, canvasWidth, canvasHeight,
    wallets, visibleWallets, groups, visibleGroups, totalRows, clustersByRow, transferLines, timeToX,
  ]);

  // ── ResizeObserver ────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => setCanvasWidth(entries[0].contentRect.width || 800));
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Wheel (zoom) ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - LABEL_WIDTH;
      const plotW = canvasWidth - LABEL_WIDTH;
      const ratio = Math.max(0, Math.min(1, mouseX / plotW));
      const range = dateEnd - dateStart;
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      const pivot = dateStart + ratio * range;
      const newRange = Math.max(3600, Math.min(10 * 365 * 86400, range * factor));
      setDateStart(pivot - ratio * newRange);
      setDateEnd(pivot + (1 - ratio) * newRange);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [canvasWidth, dateStart, dateEnd]);

  // ── Mouse handlers ────────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startDateStart: dateStart, startDateEnd: dateEnd };
    setTooltip(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX;
      const range = dragRef.current.startDateEnd - dragRef.current.startDateStart;
      const dt = (-dx / (canvasWidth - LABEL_WIDTH)) * range;
      setDateStart(dragRef.current.startDateStart + dt);
      setDateEnd(dragRef.current.startDateEnd + dt);
      return;
    }
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const hit of hitRef.current) {
      if (hit.type === 'event') {
        const { x, y, radius } = hit.event;
        if (Math.hypot(mx - x, my - y) <= radius + 5) {
          const cr = container.getBoundingClientRect();
          setTooltip({ containerX: e.clientX - cr.left, containerY: e.clientY - cr.top, event: hit.event });
          setClusterTooltip(null);
          return;
        }
      } else if (hit.type === 'cluster' && !expandedClusters.has(hit.cluster.id)) {
        const { x1, x2, y } = hit.cluster;
        const cx = (x1 + x2) / 2;
        const pillW = Math.max(x2 - x1 + 24, 48);
        if (mx >= cx - pillW / 2 - 6 && mx <= cx + pillW / 2 + 6 && my >= y - 24 && my <= y + 24) {
          const cr = container.getBoundingClientRect();
          const walletAddress = hit.cluster.events[0]?.walletAddress ?? '';
          setClusterTooltip({ containerX: e.clientX - cr.left, containerY: e.clientY - cr.top, cluster: hit.cluster, walletAddress });
          setTooltip(null);
          return;
        }
      }
    }
    setTooltip(null);
    setClusterTooltip(null);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const wasDragging = dragRef.current && Math.abs(e.clientX - dragRef.current.startX) > 5;
    dragRef.current = null;
    if (wasDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const hit of hitRef.current) {
      if (hit.type === 'cluster') {
        const { x1, x2, y } = hit.cluster;
        let inBounds: boolean;
        if (expandedClusters.has(hit.cluster.id)) {
          const pad = 18;
          const bh = ROW_HEIGHT - 12;
          inBounds = mx >= x1 - pad && mx <= x2 + pad && my >= y - bh / 2 && my <= y + bh / 2;
        } else {
          const cx = (x1 + x2) / 2;
          const pillW = Math.max(x2 - x1 + 24, 48);
          inBounds = mx >= cx - pillW / 2 - 6 && mx <= cx + pillW / 2 + 6 && my >= y - 24 && my <= y + 24;
        }
        if (inBounds) {
          setExpandedClusters(prev => {
            const next = new Set(prev);
            if (next.has(hit.cluster.id)) next.delete(hit.cluster.id);
            else next.add(hit.cluster.id);
            return next;
          });
          return;
        }
      }
    }
  };

  const handleMouseLeave = () => { dragRef.current = null; setTooltip(null); setClusterTooltip(null); };
  const cursor = dragRef.current ? 'grabbing' : 'grab';

  return (
    <div ref={containerRef} className="relative flex-1 overflow-y-auto overflow-x-hidden" style={{ cursor }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'inherit' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />

      {/* Eye icon overlays on wallet labels */}
      {wallets.map((wallet, rowIndex) => {
        const isVisible = visibleWallets.has(wallet.address);
        const top = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 - 9;
        return (
          <button
            key={wallet.address}
            onClick={() => onToggleWallet(wallet.address)}
            className="absolute flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-white/10"
            style={{ top, left: LABEL_WIDTH - 22, cursor: 'pointer' }}
            title={isVisible ? 'Hide wallet' : 'Show wallet'}
          >
            {isVisible
              ? <Eye size={13} className="text-gray-400" />
              : <EyeOff size={13} className="text-gray-600" />}
          </button>
        );
      })}

      {/* Eye + X overlays on group labels */}
      {groups.map((group, gi) => {
        const rowIndex = wallets.length + gi;
        const isVisible = visibleGroups.has(group.id);
        const top = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 - 9;
        return (
          <div key={`group-${group.id}`} className="absolute flex items-center gap-0.5" style={{ top, left: LABEL_WIDTH - 42, cursor: 'pointer' }}>
            <button
              onClick={() => onToggleGroup(group.id)}
              className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-white/10"
              title={isVisible ? 'Hide group' : 'Show group'}
            >
              {isVisible
                ? <Eye size={13} className="text-gray-400" />
                : <EyeOff size={13} className="text-gray-600" />}
            </button>
            <button
              onClick={() => onRemoveGroup(group.id)}
              className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-red-900/40"
              title="Remove group from timeline"
            >
              <X size={13} className="text-gray-500 hover:text-red-400" />
            </button>
          </div>
        );
      })}

      {/* Event tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl pointer-events-none overflow-hidden"
          style={{
            left: Math.min(tooltip.containerX + 14, canvasWidth - 520),
            top: tooltip.containerY + 14,
            maxWidth: 500,
            minWidth: 300,
          }}
        >
          <div className="px-3 py-1.5 border-b border-gray-800 text-xs text-gray-500">
            {new Date(tooltip.event.tx.blockTime * 1000).toLocaleString()}
          </div>
          <TxDetail
            tx={tooltip.event.tx}
            tokenMetas={tokenMetas}
            walletAddress={tooltip.event.walletAddress}
            walletOnly={true}
          />
        </div>
      )}

      {/* Cluster tooltip */}
      {clusterTooltip && (
        <div
          className="absolute z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl pointer-events-none overflow-hidden"
          style={{
            left: Math.min(clusterTooltip.containerX + 14, canvasWidth - 340),
            top: clusterTooltip.containerY + 14,
            minWidth: 280,
            maxWidth: 340,
          }}
        >
          <ClusterTooltip
            cluster={clusterTooltip.cluster}
            walletAddress={clusterTooltip.walletAddress}
            tokenMetas={tokenMetas}
          />
        </div>
      )}
    </div>
  );
}
