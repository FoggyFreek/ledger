import type { ParsedTransaction } from '../../types/transaction';
import { CATEGORY_COLOR } from '../../lib/categoryMeta';

// ─── Layout constants ────────────────────────────────────────────────────────
export const LABEL_WIDTH = 160;
export const ROW_HEIGHT = 76;
export const AXIS_HEIGHT = 44;
const MIN_RADIUS = 4;
const MAX_RADIUS = 13;
export const CLUSTER_THRESHOLD = 26;

// ─── Types ───────────────────────────────────────────────────────────────────
export interface PlacedEvent {
  x: number;
  y: number;
  radius: number;
  tx: ParsedTransaction;
  walletAddress: string;
  rowIndex: number;
}

export interface Cluster {
  id: string;
  events: PlacedEvent[];
  x1: number;
  x2: number;
  y: number;
  rowIndex: number;
}

export interface TransferLine {
  x: number;
  fromRowY: number;
  toRowY: number;
  label: string;
  labelY: number;
}

export type HitElement =
  | { type: 'event'; event: PlacedEvent }
  | { type: 'cluster'; cluster: Cluster };

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function eventRadius(tx: ParsedTransaction): number {
  const total = tx.balanceChanges.reduce((s, bc) => s + Math.abs(bc.amount), 0);
  const normalized = Math.min(1, Math.log10(1 + total) / 5);
  return MIN_RADIUS + normalized * (MAX_RADIUS - MIN_RADIUS);
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function computeTimeTicks(
  start: number, end: number,
): { time: number; label: string; major: boolean }[] {
  const ticks: { time: number; label: string; major: boolean }[] = [];
  const rangeDays = (end - start) / 86400;

  if (rangeDays <= 1) {
    const d = new Date(start * 1000);
    d.setMinutes(0, 0, 0);
    while (d.getTime() / 1000 <= end) {
      const major = d.getHours() === 0;
      ticks.push({ time: d.getTime() / 1000, label: major ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `${d.getHours()}:00`, major });
      d.setHours(d.getHours() + 2);
    }
  } else if (rangeDays <= 21) {
    const d = new Date(start * 1000);
    d.setHours(0, 0, 0, 0);
    while (d.getTime() / 1000 <= end) {
      const major = d.getDate() === 1;
      ticks.push({ time: d.getTime() / 1000, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), major });
      d.setDate(d.getDate() + 1);
    }
  } else if (rangeDays <= 200) {
    const d = new Date(start * 1000);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() + 1);
    while (d.getTime() / 1000 <= end) {
      const major = d.getDate() <= 7;
      ticks.push({ time: d.getTime() / 1000, label: major ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : String(d.getDate()), major });
      d.setDate(d.getDate() + 7);
    }
  } else {
    const d = new Date(start * 1000);
    d.setDate(1); d.setHours(0, 0, 0, 0);
    while (d.getTime() / 1000 <= end) {
      const major = d.getMonth() === 0;
      ticks.push({ time: d.getTime() / 1000, label: major ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : d.toLocaleDateString('en-US', { month: 'short' }), major });
      d.setMonth(d.getMonth() + 1);
    }
  }
  return ticks;
}

// ─── Canvas draw functions ───────────────────────────────────────────────────

function categoryColor(cat: string): string {
  return CATEGORY_COLOR[cat as keyof typeof CATEGORY_COLOR] ?? '#4b5563';
}

export function drawRow(
  ctx: CanvasRenderingContext2D,
  rowIndex: number,
  canvasWidth: number,
  label: string,
  isVisible: boolean,
) {
  const rowY = rowIndex * ROW_HEIGHT;
  const centreY = rowY + ROW_HEIGHT / 2;

  ctx.fillStyle = rowIndex % 2 === 0 ? '#0f172a' : '#111827';
  ctx.fillRect(0, rowY, canvasWidth, ROW_HEIGHT);

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LABEL_WIDTH, centreY);
  ctx.lineTo(canvasWidth, centreY);
  ctx.stroke();

  ctx.fillStyle = rowIndex % 2 === 0 ? '#0a0f1a' : '#0d1220';
  ctx.fillRect(0, rowY, LABEL_WIDTH, ROW_HEIGHT);

  ctx.fillStyle = isVisible ? '#9ca3af' : '#374151';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lbl = label.length > 17 ? label.slice(0, 17) + '…' : label;
  ctx.fillText(lbl, 10, centreY);
}

export function drawEvent(ctx: CanvasRenderingContext2D, event: PlacedEvent) {
  const { x, y, radius, tx } = event;
  const color = categoryColor(tx.taxCategory);
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function drawFoldedCluster(ctx: CanvasRenderingContext2D, cluster: Cluster) {
  const { events, x1, x2, y } = cluster;
  const pillW = Math.max(x2 - x1 + 24, 48);
  const pillH = 36;
  const cx = (x1 + x2) / 2;

  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(cx - pillW / 2, y - pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cx - pillW / 2, y - pillH / 2, pillW, pillH, pillH / 2);
  ctx.stroke();

  const maxDots = 3;
  const dots = events.slice(0, maxDots);
  const spacing = pillW / (dots.length + 1);
  dots.forEach((ev, i) => {
    ctx.beginPath();
    ctx.arc(cx - pillW / 2 + spacing * (i + 1), y, 5, 0, Math.PI * 2);
    ctx.fillStyle = categoryColor(ev.tx.taxCategory);
    ctx.fill();
  });

  if (events.length > maxDots) {
    ctx.fillStyle = '#64748b';
    ctx.font = '9px ui-sans-serif, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${events.length - maxDots}`, cx + pillW / 2 - 5, y);
  }
}

export function drawExpandedCluster(ctx: CanvasRenderingContext2D, cluster: Cluster) {
  const { x1, x2, y } = cluster;
  const pad = 18;
  const bh = ROW_HEIGHT - 12;
  ctx.fillStyle = 'rgba(30,41,59,0.6)';
  ctx.beginPath();
  ctx.roundRect(x1 - pad, y - bh / 2, x2 - x1 + pad * 2, bh, 12);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x1 - pad, y - bh / 2, x2 - x1 + pad * 2, bh, 12);
  ctx.stroke();
}

export function drawTransferLines(
  ctx: CanvasRenderingContext2D,
  transferLines: TransferLine[],
) {
  for (const { x, fromRowY, toRowY, label, labelY } of transferLines) {
    const top = Math.min(fromRowY, toRowY);
    const bot = Math.max(fromRowY, toRowY);
    const goingDown = toRowY > fromRowY;

    const grad = ctx.createLinearGradient(x, fromRowY, x, toRowY);
    grad.addColorStop(0, '#f9741680');
    grad.addColorStop(1, '#22c55e80');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top + 12);
    ctx.lineTo(x, bot - 12);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow tip at receiver
    const arrowDir = goingDown ? 1 : -1;
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(x, toRowY - arrowDir * 10);
    ctx.lineTo(x - 4, toRowY - arrowDir * 16);
    ctx.lineTo(x + 4, toRowY - arrowDir * 16);
    ctx.closePath();
    ctx.fill();

    // Label pill
    if (label) {
      ctx.font = 'bold 10px ui-sans-serif, sans-serif';
      const tw = ctx.measureText(label).width;
      const pad = 5;
      ctx.fillStyle = '#1e3a5f';
      ctx.beginPath();
      ctx.roundRect(x - tw / 2 - pad, labelY - 9, tw + pad * 2, 18, 4);
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - tw / 2 - pad, labelY - 9, tw + pad * 2, 18, 4);
      ctx.stroke();
      ctx.fillStyle = '#93c5fd';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, labelY);
    }
  }
}

export function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  dateStart: number,
  dateEnd: number,
  timeToX: (t: number) => number,
) {
  const axisY = canvasHeight - AXIS_HEIGHT;
  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, axisY, canvasWidth, AXIS_HEIGHT);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, axisY); ctx.lineTo(canvasWidth, axisY); ctx.stroke();

  for (const tick of computeTimeTicks(dateStart, dateEnd)) {
    const tx = timeToX(tick.time);
    if (tx < LABEL_WIDTH || tx > canvasWidth) continue;
    ctx.strokeStyle = tick.major ? '#475569' : '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx, axisY); ctx.lineTo(tx, axisY + 5); ctx.stroke();
    ctx.fillStyle = tick.major ? '#94a3b8' : '#475569';
    ctx.font = tick.major ? 'bold 11px ui-sans-serif, sans-serif' : '10px ui-sans-serif, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(tick.label, tx, axisY + 7);
  }

  // "Now" marker
  const now = Math.floor(Date.now() / 1000);
  const nowX = timeToX(now);
  if (nowX > LABEL_WIDTH && nowX < canvasWidth) {
    ctx.strokeStyle = '#7c3aed50';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(nowX, 0); ctx.lineTo(nowX, axisY); ctx.stroke();
    ctx.setLineDash([]);
  }
}
