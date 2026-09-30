// Federated learning SIMULATION: each state node fits a tiny linear demand model on its own data;
// only (clipped, noised, masked) weight updates reach the aggregator, which runs FedAvg.
import { GEO, MEDICINES, type PHC } from './generate';

export const FEATURES = ['yesterday', 'same day last week', '7-day mean', 'bias'];
const MEDS = MEDICINES.slice(0, 8).map((m) => m.id);
interface Sample { x: number[]; y: number }
export interface FedNode { stateId: string; name: string; train: Sample[]; test: Sample[] }

export function buildNodes(phcs: PHC[]): FedNode[] {
  return GEO.map((s) => {
    const train: Sample[] = [], test: Sample[] = [];
    for (const p of phcs.filter((p) => p.stateId === s.id)) for (const m of MEDS) {
      const h = p.stock[m].history;
      const scale = h.reduce((a, b) => a + b, 0) / h.length || 1; // normalise: nodes learn shape, not volume
      const x = h.map((v) => v / scale);
      for (let t = 7; t < x.length; t++) {
        const m7 = x.slice(t - 7, t).reduce((a, b) => a + b, 0) / 7;
        (t < 75 ? train : test).push({ x: [x[t - 1], x[t - 7], m7, 1], y: x[t] });
      }
    }
    return { stateId: s.id, name: s.name, train, test };
  });
}

const dot = (w: number[], x: number[]) => w.reduce((s, wi, i) => s + wi * x[i], 0);

/** Full-batch gradient descent on MSE, starting from the global weights. */
export function localTrain(w0: number[], data: Sample[], steps = 2, lr = 0.03) {
  const w = [...w0];
  for (let s = 0; s < steps; s++) {
    const g = w.map(() => 0);
    for (const { x, y } of data) { const e = dot(w, x) - y; x.forEach((xi, i) => (g[i] += (2 * e * xi) / data.length)); }
    w.forEach((_, i) => (w[i] -= lr * g[i]));
  }
  return w;
}

/** Weighted absolute percentage error, in %. */
export const wape = (w: number[], data: Sample[]) =>
  (100 * data.reduce((s, { x, y }) => s + Math.abs(y - dot(w, x)), 0)) / data.reduce((s, d) => s + Math.abs(d.y), 0);

const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
export const toHex = (v: number[]) =>
  v.map((x) => (Math.floor(Math.abs(x * 0x7fffffff)) >>> 0).toString(16).padStart(8, '0')).join('').slice(0, 32);

export interface RoundOpts { sigma: number; clip: number; secure: boolean }
export interface NodeUpdate { stateId: string; n: number; localErr: number; payload: string; delta: number[] }

export function fedRound(global: number[], nodes: FedNode[], { sigma, clip, secure }: RoundOpts) {
  const updates: NodeUpdate[] = nodes.map((node) => {
    const w = localTrain(global, node.train);
    let delta = w.map((wi, i) => wi - global[i]);
    const norm = Math.hypot(...delta);
    if (norm > clip) delta = delta.map((d) => (d * clip) / norm); // clip, then add DP noise
    delta = delta.map((d) => d + gauss() * sigma * clip / nodes.length);
    return { stateId: node.stateId, n: node.train.length, localErr: wape(w, node.test), payload: '', delta };
  });
  // Secure aggregation: pairwise masks cancel in the sum, so the aggregator never sees one state's update.
  const total = updates.reduce((s, u) => s + u.n, 0);
  const sent = updates.map((u) => u.delta.map((d) => d * u.n));
  if (secure) for (let i = 0; i < sent.length; i++) for (let j = i + 1; j < sent.length; j++) {
    const mask = sent[i].map(() => gauss() * 1e4);
    sent[i] = sent[i].map((v, k) => v + mask[k]);
    sent[j] = sent[j].map((v, k) => v - mask[k]);
  }
  updates.forEach((u, i) => (u.payload = toHex(sent[i].map((v) => v / 1e5))));
  const sum = global.map((_, k) => sent.reduce((s, v) => s + v[k], 0));
  const next = global.map((g, k) => g + sum[k] / total);
  return { next, updates, errors: Object.fromEntries(nodes.map((n) => [n.stateId, wape(next, n.test)])) as Record<string, number> };
}
