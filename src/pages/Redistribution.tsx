import { useMemo, useState } from 'react';
import { ArrowRight, Check, ClipboardList, Truck, X } from 'lucide-react';
import { useApp } from '../App';
import { MED } from '../data/generate';
import { riskScore, type Transfer } from '../data/engine';
import MapView from '../MapView';
import { Card, PageHead, fmt, inr } from '../ui';

export default function Redistribution() {
  const { transfers, scoped, byId, alerts, params, audit, t } = useApp();
  const ids = useMemo(() => new Set(scoped.map((p) => p.id)), [scoped]);
  const list = useMemo(() => transfers.filter((x) => ids.has(x.toId) || ids.has(x.fromId)), [transfers, ids]);
  const [sel, setSel] = useState<string | undefined>(params.focus);
  const selected = list.find((x) => x.id === sel) ?? list[0];

  const points = useMemo(() => [...new Set(list.flatMap((x) => [x.fromId, x.toId]))].map((id) => byId[id])
    .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, risk: riskScore(p.id, alerts), label: `${p.name}, ${p.district}`, highlight: p.id === selected?.fromId || p.id === selected?.toId })), [list, byId, alerts, selected]);
  const lines = useMemo(() => list.map((x) => ({ id: x.id, from: byId[x.fromId], to: byId[x.toId], label: `${fmt(x.qty)} × ${MED[x.medId].name}: ${byId[x.fromId].name} → ${byId[x.toId].name}`, active: x.id === selected?.id })), [list, byId, selected]);
  const decisions = audit.filter((a) => a.action.startsWith('transfer') || a.action.startsWith('scenario'));

  return (
    <>
      <PageHead title={t('Redistribution')} sub="Optimiser proposes cross-district transfers from surplus to deficit PHCs. Nothing moves without an officer's approval." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          {list.map((x) => <TransferCard key={x.id} x={x} active={x.id === selected?.id} onFocus={() => setSel(x.id)} />)}
          {!list.length && <Card><p className="text-slate-500">No transfers needed right now: no deficit PHC has a surplus source within 320 km in the same state.</p></Card>}
        </div>
        <Card title={`${t('Proposed transfers')} (${list.length})`} icon={Truck} className="h-fit lg:sticky lg:top-20 lg:col-span-2">
          <MapView points={points} lines={lines} height={400} onSelect={(id) => setSel(list.find((x) => x.toId === id || x.fromId === id)?.id)} />
        </Card>
      </div>

      <Card title={t('Audit trail')} icon={ClipboardList} className="mt-5">
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="tbl">
            <thead><tr><th>Time</th><th>Officer</th><th>Action</th><th>Detail</th><th>{t('Reason')}</th></tr></thead>
            <tbody>
              {decisions.map((a, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{new Date(a.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="whitespace-nowrap">{a.by}</td>
                  <td><span className={`inline-flex items-center gap-1 text-xs font-semibold ${a.action.includes('approved') ? 'text-emerald-700' : a.action.includes('rejected') ? 'text-red-700' : 'text-slate-700'}`}>{a.action.includes('approved') ? <Check size={13} /> : a.action.includes('rejected') ? <X size={13} /> : null}{a.action}</span></td>
                  <td className="text-slate-600">{a.detail}</td>
                  <td className="text-slate-600">{a.reason || '—'}</td>
                </tr>
              ))}
              {!decisions.length && <tr><td colSpan={5} className="text-slate-500">No decisions yet. Approvals and rejections are logged here with the officer's reason.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function TransferCard({ x, active, onFocus }: { x: Transfer; active: boolean; onFocus: () => void }) {
  const { byId, decide, t } = useApp();
  const [mode, setMode] = useState<'approved' | 'rejected' | null>(null);
  const [reason, setReason] = useState('');
  const src = byId[x.fromId], dst = byId[x.toId], m = MED[x.medId];
  return (
    <article onClick={onFocus} className={`rounded-2xl border bg-white p-4 shadow-sm transition ${active ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{fmt(x.qty)} × {m.name}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">cross-district</span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
        <b className="text-slate-800">{src.name}</b> ({src.district}) <ArrowRight size={14} /> <b className="text-slate-800">{dst.name}</b> ({dst.district})
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat k="Distance" v={`${x.distanceKm} km`} />
        <Stat k="Shelf life of lot" v={`${x.shelfLifeDays} days`} warn={x.shelfLifeDays < 60} sub={x.lot} />
        <Stat k="Transport cost" v={inr(x.cost)} />
        <Stat k="Stock value" v={inr(x.value)} />
      </dl>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Trade label={`Source · ${src.name}`} before={x.srcBefore} after={x.srcAfter} kind="source" />
        <Trade label={`Destination · ${dst.name}`} before={x.dstBefore} after={x.dstAfter} kind="dest" />
      </div>
      {mode ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); decide(x, mode, reason.trim()); }}>
          <label className="block"><span className="label">{t('Reason')} ({mode === 'approved' ? 'approval' : 'rejection'}, logged)</span>
            <input autoFocus required minLength={3} className="field" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={mode === 'approved' ? 'e.g. Vehicle available Thursday; source confirmed stock' : 'e.g. Source stock reserved for upcoming camp'} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={`btn ${mode === 'approved' ? 'btn-primary' : 'btn-danger'}`}>{mode === 'approved' ? <Check size={15} /> : <X size={15} />}Confirm {mode === 'approved' ? 'approval' : 'rejection'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" onClick={() => setMode('approved')}><Check size={15} />{t('Approve')}</button>
          <button className="btn btn-danger" onClick={() => setMode('rejected')}><X size={15} />{t('Reject')}</button>
        </div>
      )}
    </article>
  );
}

function Stat({ k, v, sub, warn }: { k: string; v: string; sub?: string; warn?: boolean }) {
  return <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">{k}</dt><dd className={`font-semibold tabular-nums ${warn ? 'text-amber-700' : ''}`}>{v}</dd>{sub && <dd className="text-xs text-slate-400">{sub}</dd>}</div>;
}

/** Days-of-cover before -> after, with a plain-language risk verdict (not colour alone). */
function Trade({ label, before, after, kind }: { label: string; before: number; after: number; kind: 'source' | 'dest' }) {
  const pct = (d: number) => `${Math.min(100, (d / 90) * 100)}%`;
  const verdict = kind === 'source'
    ? after >= 30 ? 'Low risk: source keeps 30+ days' : after >= 21 ? 'Moderate risk at source' : 'High risk: source drops below 21 days'
    : after >= 21 ? 'Relieved: stock-out averted' : 'Partly relieved';
  const tone = after < 21 ? 'text-amber-700' : 'text-emerald-700';
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="truncate text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-sm font-semibold tabular-nums">{before}d <ArrowRight size={13} className="text-slate-400" /> {after}d <span className="font-normal text-slate-400">of cover</span></div>
      <div className="relative mt-1.5 h-2 rounded-full bg-slate-100">
        <div className={`absolute inset-y-0 left-0 rounded-full ${kind === 'source' ? 'bg-amber-400' : 'bg-teal-500'}`} style={{ width: pct(after) }} />
        <div className="absolute -top-0.5 h-3 w-0.5 bg-slate-700" style={{ left: pct(before) }} title={`before: ${before} days`} />
      </div>
      <div className={`mt-1 text-xs font-medium ${tone}`}>{verdict}</div>
    </div>
  );
}
