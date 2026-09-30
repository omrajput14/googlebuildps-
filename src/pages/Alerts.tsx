import { useMemo, useState } from 'react';
import { Loader2, Sparkles, TrendingUp, Truck } from 'lucide-react';
import { useApp } from '../App';
import { MED } from '../data/generate';
import { SEV_RANK, type Alert, type Severity } from '../data/engine';
import { explainAlert, type Explanation } from '../gemini';
import { alertTitle } from '../i18n';
import { Card, PageHead, SevBadge, SourceTag, fmt } from '../ui';

export default function Alerts() {
  const { alerts, scoped, params, t } = useApp();
  const [sev, setSev] = useState<Severity | 'all'>((params.sev as Severity) || 'all');
  const [district, setDistrict] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(30);
  const ids = useMemo(() => new Set(scoped.map((p) => p.id)), [scoped]);
  const districts = [...new Set(scoped.map((p) => p.district))];
  const byId = useApp().byId;
  const list = alerts.filter((a) => ids.has(a.phcId) && (sev === 'all' || a.severity === sev) && (district === 'all' || byId[a.phcId].district === district) &&
    (!q || `${MED[a.medId].name} ${byId[a.phcId].name}`.toLowerCase().includes(q.toLowerCase())));
  const counts = (s: Severity) => alerts.filter((a) => ids.has(a.phcId) && a.severity === s).length;

  return (
    <>
      <PageHead title={t('Alerts')} sub="Projected stock-outs and near-expiry lots, most urgent first" />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button className={`chip ${sev === 'all' ? 'chip-on' : ''}`} onClick={() => setSev('all')}>{t('All')}</button>
          {(Object.keys(SEV_RANK) as Severity[]).map((s) => (
            <button key={s} aria-pressed={sev === s} className={`chip ${sev === s ? 'chip-on' : ''}`} onClick={() => setSev(s)}>{t(s[0].toUpperCase() + s.slice(1))} ({counts(s)})</button>
          ))}
          <div className="flex-1" />
          {districts.length > 1 && (
            <select className="field w-auto" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District">
              <option value="all">{t('All')} districts</option>
              {districts.map((d) => <option key={d}>{d}</option>)}
            </select>
          )}
          <input className="field w-full sm:w-64" placeholder={t('Search medicine or PHC')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>
      <div className="space-y-3">
        {list.slice(0, limit).map((a) => <AlertCard key={a.id} a={a} />)}
        {!list.length && <Card><p className="text-slate-500">{t('Nothing urgent. All clear.')}</p></Card>}
        {list.length > limit && <button className="btn btn-secondary w-full" onClick={() => setLimit(limit + 30)}>{t('Show more')} ({list.length - limit})</button>}
      </div>
    </>
  );
}

function AlertCard({ a }: { a: Alert }) {
  const { byId, lang, t, go, transfers, user } = useApp();
  const [exp, setExp] = useState<Record<string, Explanation>>({});
  const [busy, setBusy] = useState(false);
  const p = byId[a.phcId];
  const tr = transfers.find((x) => x.toId === a.phcId && x.medId === a.medId);
  const e = exp[lang];
  const explain = async () => {
    setBusy(true);
    const r = await explainAlert(a, p, lang, tr, tr && byId[tr.fromId]);
    setExp((x) => ({ ...x, [lang]: r }));
    setBusy(false);
  };
  const border = { critical: 'border-l-red-600', warning: 'border-l-amber-500', watch: 'border-l-sky-500' }[a.severity];
  return (
    <article className={`rounded-2xl border border-l-4 border-slate-200 ${border} bg-white p-4 shadow-sm`}>
      <div className="flex flex-wrap items-start gap-3">
        <SevBadge sev={a.severity} t={t} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900">{alertTitle(a, p, lang)}</h3>
          <p className="text-sm text-slate-500">{p.block} block · {p.district}, {p.state}</p>
        </div>
        <dl className="flex gap-4 text-right text-xs">
          <div><dt className="text-slate-500">{t('Stock')}</dt><dd className="text-sm font-semibold tabular-nums">{fmt(a.stock)}</dd></div>
          <div><dt className="text-slate-500">Avg/day</dt><dd className="text-sm font-semibold tabular-nums">{a.avgDaily.toFixed(1)}</dd></div>
          <div><dt className="text-slate-500">{t('Days left')}</dt><dd className="text-sm font-semibold tabular-nums">{a.daysLeft} <span className="font-normal text-slate-400">/ {a.daysLeftP90} P90</span></dd></div>
        </dl>
      </div>
      {e && (
        <div className="mt-3 rounded-xl bg-violet-50/60 p-3 text-sm ring-1 ring-violet-100" aria-live="polite">
          <p className="text-slate-800">{e.explanation}</p>
          <p className="mt-1"><b className="text-violet-900">{t('Suggested action')}:</b> {e.action}</p>
          <div className="mt-1"><SourceTag source={e.source} /></div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-ai" onClick={explain} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{t('Explain with Gemini')}</button>
        <button className="btn btn-secondary" onClick={() => go('forecast', { phc: a.phcId, med: a.medId })}><TrendingUp size={15} />{t('View forecast')}</button>
        {tr && user.role !== 'pharmacist' && <button className="btn btn-secondary" onClick={() => go('redistribution', { focus: tr.id })}><Truck size={15} />{t('Find transfer')}: {fmt(tr.qty)} from {byId[tr.fromId].district}</button>}
        {a.mult !== 1 && <span className="self-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">emergency ×{a.mult}</span>}
      </div>
    </article>
  );
}
