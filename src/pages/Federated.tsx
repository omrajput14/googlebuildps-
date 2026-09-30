import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, Database, FastForward, FlaskConical, Lock, Play, RotateCcw, Server, ShieldCheck } from 'lucide-react';
import { useApp } from '../App';
import { GEO } from '../data/generate';
import { FEATURES, buildNodes, fedRound, wape, type NodeUpdate } from '../data/fed';
import { Card, PageHead, fmt } from '../ui';

const COLORS: Record<string, string> = { MH: '#0d9488', BR: '#7c3aed', TN: '#ea580c' };
const CLIP = 0.3;
type Phase = 'idle' | 'training' | 'sending' | 'aggregating';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Federated() {
  const { phcs, t } = useApp();
  const nodes = useMemo(() => buildNodes(phcs), [phcs]);
  const init = () => [{ round: 0, ...Object.fromEntries(nodes.map((n) => [n.stateId, +wape([0, 0, 0, 0], n.test).toFixed(1)])) }];
  const [w, setW] = useState([0, 0, 0, 0]);
  const [hist, setHist] = useState<Record<string, number>[]>(init);
  const [updates, setUpdates] = useState<NodeUpdate[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [sigma, setSigma] = useState(0.3);
  const [secure, setSecure] = useState(true);

  const run = async (rounds: number) => {
    let g = w, h = hist;
    for (let r = 0; r < rounds; r++) {
      const fast = rounds > 1;
      setPhase('training'); await sleep(fast ? 60 : 450);
      const out = fedRound(g, nodes, { sigma, clip: CLIP, secure });
      setUpdates(out.updates);
      setPhase('sending'); await sleep(fast ? 60 : 450);
      setPhase('aggregating'); await sleep(fast ? 40 : 350);
      g = out.next;
      h = [...h, { round: h.length, ...Object.fromEntries(Object.entries(out.errors).map(([k, v]) => [k, +v.toFixed(1)])) }];
      setW(g); setHist(h);
    }
    setPhase('idle');
  };
  const reset = () => { setW([0, 0, 0, 0]); setHist(init()); setUpdates([]); };
  const round = hist.length - 1;
  const busy = phase !== 'idle';

  return (
    <>
      <PageHead title={t('Federated learning')} sub="Each state trains on its own data; only model weight updates travel. The aggregator averages them (FedAvg).">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold tracking-wide text-amber-800 uppercase ring-1 ring-amber-300"><FlaskConical size={14} /> Simulation</span>
      </PageHead>
      <p className="-mt-3 mb-5 text-sm text-slate-500">Runs entirely in your browser on the mock data: a 4-weight linear demand model, real gradient descent, real FedAvg, pairwise-mask secure aggregation and Gaussian DP noise. It illustrates the protocol; it is not production cryptography.</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => run(1)}><Play size={15} />{t('Run training round')}</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => run(10)}><FastForward size={15} />Run 10 rounds</button>
        <button className="btn btn-secondary" disabled={busy} onClick={reset}><RotateCcw size={15} />{t('Reset')}</button>
        <span className="self-center text-sm text-slate-600">Round <b>{round}</b>{busy && <> · <span className="font-medium text-teal-700">{phase}…</span></>}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {nodes.map((n) => {
          const u = updates.find((x) => x.stateId === n.stateId);
          const count = phcs.filter((p) => p.stateId === n.stateId).length;
          return (
            <Card key={n.stateId} className={phase === 'training' ? 'ring-2 ring-teal-400/40' : ''}>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{ background: COLORS[n.stateId] }}><Database size={17} /></span>
                <div className="flex-1"><div className="font-semibold">{n.name} node</div><div className="text-xs text-slate-500">State data centre · {count} PHCs</div></div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800"><Lock size={13} /> Raw data stays in {n.name}: {fmt(n.train.length + n.test.length)} facility-day records</div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs text-slate-500">Local model error</dt><dd className="font-semibold tabular-nums">{u ? `${u.localErr.toFixed(1)}%` : '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">Global model error</dt><dd className="font-semibold tabular-nums">{hist.at(-1)![n.stateId]}%</dd></div>
              </dl>
              <div className="mt-3">
                <div className="text-xs text-slate-500">Outgoing update {secure ? '(masked + noised)' : '(noised)'}</div>
                <code className={`mt-1 block truncate rounded bg-slate-900 px-2 py-1 font-mono text-xs text-teal-300 ${phase === 'sending' ? 'animate-pulse' : ''}`}>{u ? `0x${u.payload}` : 'waiting for round…'}</code>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="my-2 flex justify-center text-slate-400" aria-hidden><ArrowDown className={phase === 'sending' ? 'animate-bounce text-teal-600' : ''} /></div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Aggregator (national)" icon={Server} className={phase === 'aggregating' ? 'ring-2 ring-violet-400/50' : ''}>
          <p className="text-sm text-slate-600">Sees only {secure ? 'masked vectors whose masks cancel in the sum' : 'each state\'s noised update'}. Computes the weighted average (FedAvg) and broadcasts the new global model.</p>
          <table className="tbl mt-3">
            <thead><tr><th>Feature</th><th className="text-right">Global weight</th></tr></thead>
            <tbody>{FEATURES.map((f, i) => <tr key={f}><td>{f}</td><td className="text-right font-mono tabular-nums">{w[i].toFixed(3)}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card title="Global model error by state (WAPE, lower is better)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={hist} margin={{ left: -15, right: 10 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="round" tick={{ fontSize: 11 }} label={{ value: 'round', position: 'insideBottomRight', offset: -2, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 'auto']} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              {GEO.map((g) => <Line key={g.id} dataKey={g.id} name={g.name} stroke={COLORS[g.id]} strokeWidth={2.5} dot={{ r: 2.5 }} isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Privacy controls" icon={ShieldCheck} className="mt-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-teal-600" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
            <span><span className="font-semibold">Secure aggregation</span><span className="block text-sm text-slate-500">Each pair of states shares a random mask; one adds it, the other subtracts it. The aggregator can only read the sum.</span></span>
          </label>
          <label className="block">
            <span className="font-semibold">Differential-privacy noise σ = {sigma.toFixed(1)}</span>
            <input type="range" min={0} max={2} step={0.1} value={sigma} onChange={(e) => setSigma(+e.target.value)} className="mt-2 w-full accent-teal-600" aria-label="Differential privacy noise multiplier" />
            <span className="block text-sm text-slate-500">Updates are clipped to norm {CLIP} and Gaussian noise is added. More noise = stronger privacy, noisier convergence. Try 2.0.</span>
          </label>
          <div className="text-sm">
            <div className="font-semibold">What crosses the state boundary</div>
            <ul className="mt-1 list-inside list-disc text-slate-600">
              <li>4 numbers per round (the weight update)</li>
              <li>Never: facility ledgers, dispensing rows, staff rosters</li>
              <li>Never: any patient-level data (none is collected)</li>
            </ul>
          </div>
        </div>
      </Card>
    </>
  );
}
