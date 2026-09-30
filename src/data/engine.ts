// Forecasting, early warning and redistribution. Pure functions over PHC data.
import { DAYS, MED, MEDICINES, weekday, daysUntil, type PHC, type User } from './generate';

export type Severity = 'critical' | 'warning' | 'watch';
export const SEV_RANK: Record<Severity, number> = { critical: 0, warning: 1, watch: 2 };
export const HORIZON = 60;
export type Multipliers = Record<string, Record<string, number>>; // districtId -> medId -> x

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export const key = (phcId: string, medId: string) => `${phcId}|${medId}`;

export interface Forecast { p10: number[]; p50: number[]; p90: number[] }

// ponytail: seasonal-naive level x weekday factors x damped trend, Gaussian residual bands.
// Production swaps this for the federated Vertex AI model; the P10/P50/P90 contract stays the same.
export function forecast(history: number[], horizon = HORIZON, mult = 1): Forecast {
  const n = history.length;
  const recent = history.slice(-56);
  const base = mean(recent) || 1;
  const dow = Array.from({ length: 7 }, (_, w) => {
    const xs = recent.filter((_, j) => weekday(n - 56 + j) === w);
    return xs.length ? mean(xs) / base : 1;
  });
  const level = mean(history.slice(-14)) || 0;
  const w1 = mean(history.slice(-14, -7)), w4 = mean(history.slice(-28, -21));
  const trend = level ? Math.max(-0.01, Math.min(0.015, (w1 - w4) / 21 / level)) : 0; // fractional change / day
  const resid = history.slice(-28).map((y, j) => y - level * dow[weekday(n - 28 + j)]);
  const sigma = Math.sqrt(mean(resid.map((r) => r * r)));
  const f: Forecast = { p10: [], p50: [], p90: [] };
  for (let h = 1; h <= horizon; h++) {
    const damp = (1 - 0.97 ** h) / 0.03; // damped trend: flattens after ~5 weeks
    const p50 = Math.max(0, level * (1 + trend * damp) * dow[weekday(n - 1 + h)]) * mult;
    const spread = 1.2816 * sigma * Math.sqrt(1 + h / 14) * mult;
    f.p50.push(p50);
    f.p10.push(Math.max(0, p50 - spread));
    f.p90.push(p50 + spread);
  }
  return f;
}

/** Whole days until cumulative demand exceeds stock (capped at series length). */
export function daysOfStock(stock: number, demand: number[]): number {
  let used = 0;
  for (let i = 0; i < demand.length; i++) if ((used += demand[i]) > stock) return i;
  return demand.length;
}

export interface Line { phcId: string; medId: string; stock: number; fc: Forecast; avgDaily: number; daysLeft: number; daysLeftP90: number; mult: number }

export function analyse(phcs: PHC[], mults: Multipliers = {}): Record<string, Line> {
  const out: Record<string, Line> = {};
  for (const p of phcs) for (const m of MEDICINES) {
    const s = p.stock[m.id];
    const mult = mults[p.districtId]?.[m.id] ?? 1;
    const fc = forecast(s.history, HORIZON, mult);
    out[key(p.id, m.id)] = {
      phcId: p.id, medId: m.id, stock: s.stock, fc, mult,
      avgDaily: mean(fc.p50.slice(0, 14)),
      daysLeft: daysOfStock(s.stock, fc.p50),
      daysLeftP90: daysOfStock(s.stock, fc.p90),
    };
  }
  return out;
}

export const severityFor = (days: number): Severity | null => (days <= 7 ? 'critical' : days <= 14 ? 'warning' : days <= 21 ? 'watch' : null);

export interface Alert {
  id: string; kind: 'stockout' | 'expiry'; severity: Severity; phcId: string; medId: string;
  stock: number; avgDaily: number; daysLeft: number; daysLeftP90: number; mult: number;
  batch?: string; expiryDays?: number; wasteQty?: number;
}

export function alertsFrom(phcs: PHC[], lines: Record<string, Line>): Alert[] {
  const out: Alert[] = [];
  for (const p of phcs) for (const m of MEDICINES) {
    const l = lines[key(p.id, m.id)];
    if (!l) continue;
    const base = { phcId: p.id, medId: m.id, stock: l.stock, avgDaily: l.avgDaily, daysLeft: l.daysLeft, daysLeftP90: l.daysLeftP90, mult: l.mult };
    const sev = severityFor(l.daysLeft);
    if (sev) out.push({ ...base, id: `so-${p.id}-${m.id}`, kind: 'stockout', severity: sev });
    // FEFO: earlier lots are issued first, so a lot expiring in d days gets whatever demand remains after them.
    let before = 0;
    for (const b of p.stock[m.id].batches) {
      const d = daysUntil(b.expiry);
      if (d <= 45 && d > 0) {
        const usable = Math.max(0, l.fc.p50.slice(0, d).reduce((s, x) => s + x, 0) - before);
        const waste = Math.round(b.qty - usable);
        if (waste > 0) out.push({ ...base, id: `ex-${p.id}-${b.batch}`, kind: 'expiry', severity: d <= 21 ? 'warning' : 'watch', batch: b.batch, expiryDays: d, wasteQty: waste });
      }
      before += b.qty;
    }
  }
  return out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.daysLeft - b.daysLeft);
}

// ---- Redistribution ----
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.3; // x1.3 road factor
}

export interface Transfer {
  id: string; medId: string; fromId: string; toId: string; qty: number; distanceKm: number;
  shelfLifeDays: number; lot: string; cost: number; value: number;
  srcBefore: number; srcAfter: number; dstBefore: number; dstAfter: number;
}

const TARGET_COVER = 30, KEEP_AT_SOURCE = 45, MAX_KM = 320;

// ponytail: greedy most-urgent-first matching, O(needs x sources). Swap for an LP/min-cost-flow
// (OR-Tools on Cloud Run) when networks reach thousands of facilities.
export function proposeTransfers(phcs: PHC[], lines: Record<string, Line>, skip: Set<string> = new Set()): Transfer[] {
  const byId = Object.fromEntries(phcs.map((p) => [p.id, p]));
  const out: Transfer[] = [];
  for (const m of MEDICINES) {
    const ls = phcs.map((p) => lines[key(p.id, m.id)]).filter(Boolean);
    const needs = ls.filter((l) => l.daysLeft < 14).sort((a, b) => a.daysLeft - b.daysLeft);
    const avail = new Map(ls.filter((l) => l.stock / Math.max(l.avgDaily, 0.01) > 60).map((l) => [l.phcId, Math.floor(l.stock - l.avgDaily * KEEP_AT_SOURCE)]));
    for (const need of needs) {
      const dst = byId[need.phcId];
      let want = Math.ceil(need.avgDaily * TARGET_COVER - need.stock);
      const cands = [...avail.entries()]
        .map(([id, a]) => ({ src: byId[id], a }))
        .filter(({ src, a }) => a > 0 && src.stateId === dst.stateId && src.districtId !== dst.districtId && !skip.has(`${m.id}|${src.id}|${dst.id}`))
        .map((c) => {
          const lot = c.src.stock[m.id].batches.find((b) => daysUntil(b.expiry) > 10);
          const km = distanceKm(c.src, dst);
          return { ...c, km, lot, score: km - (lot && daysUntil(lot.expiry) < 60 ? 150 : 0) }; // prefer moving short-dated stock to fast users
        })
        .filter((c) => c.km <= MAX_KM && c.lot)
        .sort((a, b) => a.score - b.score);
      for (const c of cands) {
        if (want <= 0) break;
        const qty = Math.min(want, c.a);
        const srcLine = lines[key(c.src.id, m.id)];
        const days = (stock: number, l: Line) => Math.min(99, Math.round(stock / Math.max(l.avgDaily, 0.01)));
        out.push({
          id: `tr-${m.id}-${c.src.id}-${dst.id}`, medId: m.id, fromId: c.src.id, toId: dst.id, qty,
          distanceKm: Math.round(c.km), lot: c.lot!.batch, shelfLifeDays: daysUntil(c.lot!.expiry),
          cost: Math.round(800 + 22 * c.km), value: Math.round(qty * MED[m.id].cost),
          srcBefore: days(srcLine.stock, srcLine), srcAfter: days(srcLine.stock - qty, srcLine),
          dstBefore: days(need.stock, need), dstAfter: days(need.stock + qty, need),
        });
        avail.set(c.src.id, c.a - qty);
        want -= qty;
      }
    }
  }
  return out.sort((a, b) => a.dstBefore - b.dstBefore);
}

// ---- Scope & summaries ----
export function inScope(p: PHC, u: User) {
  if (u.role === 'pharmacist') return p.id === u.phcId;
  if (u.role === 'district') return p.districtId === u.districtId;
  if (u.role === 'state') return p.stateId === u.stateId;
  return true;
}

export interface Summary { phcs: number; critical: number; warning: number; watch: number; bedsFree: number; beds: number; staffPresent: number; staff: number; reporting: number }
export function summarise(phcs: PHC[], alerts: Alert[]): Summary {
  const ids = new Set(phcs.map((p) => p.id));
  const al = alerts.filter((a) => ids.has(a.phcId));
  const staff = (p: PHC) => Object.values(p.staff);
  return {
    phcs: phcs.length,
    critical: al.filter((a) => a.severity === 'critical').length,
    warning: al.filter((a) => a.severity === 'warning').length,
    watch: al.filter((a) => a.severity === 'watch').length,
    bedsFree: phcs.reduce((s, p) => s + p.beds - p.bedsOccupied, 0),
    beds: phcs.reduce((s, p) => s + p.beds, 0),
    staffPresent: phcs.reduce((s, p) => s + staff(p).reduce((t, x) => t + x.present, 0), 0),
    staff: phcs.reduce((s, p) => s + staff(p).reduce((t, x) => t + x.sanctioned, 0), 0),
    reporting: phcs.filter((p) => p.lastReportDays === 0).length,
  };
}

/** 0..1 stock-out risk for the heatmap. */
export function riskScore(phcId: string, alerts: Alert[]) {
  const a = alerts.filter((x) => x.phcId === phcId && x.kind === 'stockout');
  const c = a.filter((x) => x.severity === 'critical').length, w = a.filter((x) => x.severity === 'warning').length, v = a.length - c - w;
  return Math.min(1, (3 * c + 1.5 * w + 0.5 * v) / 5);
}

export { DAYS };
