import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, Package, ShoppingCart, TrendingUp } from 'lucide-react';
import { useApp } from '../App';
import { DAYS, MED, MEDICINES, dateOf } from '../data/generate';
import { key, severityFor } from '../data/engine';
import { Card, Kpi, PageHead, SevBadge, fmt } from '../ui';

const LEAD_TIME = 7; // days from indent to delivery

export default function Forecast() {
  const { scoped, params, go, lines, t, byId, user } = useApp();
  const phcId = params.phc && byId[params.phc] && scoped.some((p) => p.id === params.phc) ? params.phc : scoped[0].id;
  const medId = MED[params.med] ? params.med : 'ors';
  const horizon = [7, 14, 30].includes(+params.h) ? +params.h : 14;
  const set = (patch: Record<string, string>) => go('forecast', { phc: phcId, med: medId, h: String(horizon), ...patch });
  const p = byId[phcId], l = lines[key(phcId, medId)], m = MED[medId];
  const hist = p.stock[medId].history;

  const data = useMemo(() => {
    const label = (i: number) => dateOf(i).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const past = hist.slice(-30).map((v, j) => ({ d: label(DAYS - 30 + j), actual: v } as Record<string, unknown>));
    past[past.length - 1] = { ...past[past.length - 1], p50: hist[DAYS - 1], band: [hist[DAYS - 1], hist[DAYS - 1]] }; // join the lines
    const fut = Array.from({ length: horizon }, (_, h) => ({ d: label(DAYS + h), p50: +l.fc.p50[h].toFixed(1), band: [+l.fc.p10[h].toFixed(1), +l.fc.p90[h].toFixed(1)] }));
    return [...past, ...fut];
  }, [hist, l, horizon]);

  const sum = (a: number[], n: number) => a.slice(0, n).reduce((s, x) => s + x, 0);
  const reorder = Math.max(0, Math.ceil(sum(l.fc.p90, horizon + LEAD_TIME) - l.stock));
  const sev = severityFor(l.daysLeft);
  const outDay = l.daysLeft < horizon ? data[29 + l.daysLeft + 1]?.d as string : undefined;

  return (
    <>
      <PageHead title={t('Forecast')} sub="Daily demand forecast with P10 / P50 / P90 uncertainty band">
        {l.mult !== 1 && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">Emergency multiplier ×{l.mult} applied</span>}
      </PageHead>
      <Card className="mb-5">
        <div className="grid gap-3 md:grid-cols-[2fr_2fr_auto]">
          <label><span className="label">{t('Facility')}</span>
            <select className="field" value={phcId} disabled={user.role === 'pharmacist'} onChange={(e) => set({ phc: e.target.value })}>
              {scoped.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.district}</option>)}
            </select>
          </label>
          <label><span className="label">{t('Medicine')}</span>
            <select className="field" value={medId} onChange={(e) => set({ med: e.target.value })}>
              {MEDICINES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <div><span className="label">Horizon</span>
            <div className="flex gap-1.5" role="group" aria-label="Forecast horizon">
              {[7, 14, 30].map((h) => <button key={h} className={`chip ${h === horizon ? 'chip-on' : ''}`} aria-pressed={h === horizon} onClick={() => set({ h: String(h) })}>{h} {t('days')}</button>)}
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={Package} label={t('Stock')} value={fmt(l.stock)} sub={`${m.unit}s on hand`} />
        <Kpi icon={CalendarClock} tone={sev === 'critical' ? 'red' : sev ? 'amber' : 'teal'} label="Days of stock left" value={l.daysLeft >= 60 ? '60+' : l.daysLeft} sub={`${l.daysLeftP90 >= 60 ? '60+' : l.daysLeftP90} if demand runs high (P90)`} />
        <Kpi icon={TrendingUp} label={`${horizon}-day demand`} value={fmt(sum(l.fc.p50, horizon))} sub={`P10 ${fmt(sum(l.fc.p10, horizon))} – P90 ${fmt(sum(l.fc.p90, horizon))}`} />
        <Kpi icon={ShoppingCart} tone={reorder ? 'amber' : 'slate'} label="Suggested indent" value={fmt(reorder)} sub={`covers ${horizon}d + ${LEAD_TIME}d lead time at P90`} />
      </div>

      <Card title={<span className="flex items-center gap-2">{m.name} · {p.name} {sev && <SevBadge sev={sev} t={t} />}</span>}>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data} margin={{ left: -10, right: 12, top: 22 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="d" tick={{ fontSize: 11 }} interval={Math.ceil(data.length / 10)} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: `${m.unit}s / day`, angle: -90, position: 'insideLeft', offset: 20, fontSize: 11, fill: '#64748b' }} />
            <Tooltip formatter={(v) => (Array.isArray(v) ? `${v[0]} – ${v[1]}` : v) as string} />
            <Legend />
            <Area dataKey="band" name="P10–P90 band" stroke="none" fill="#99f6e4" fillOpacity={0.6} />
            <Line dataKey="actual" name="Dispensed (actual)" stroke="#334155" strokeWidth={2} dot={false} />
            <Line dataKey="p50" name="Forecast (P50)" stroke="#0d9488" strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
            <ReferenceLine x={data[29].d as string} stroke="#94a3b8" label={{ value: 'today', fontSize: 11, fill: '#64748b', position: 'top' }} />
            {outDay && <ReferenceLine x={outDay} stroke="#dc2626" strokeDasharray="3 3" label={{ value: 'stock-out (P50)', fontSize: 11, fill: '#dc2626', position: 'insideTopRight' }} />}
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-slate-500">
          Prototype model: weekday-seasonal level with damped trend and residual-based intervals, trained on 90 days of dispensing. In production this is the federated model trained on Vertex AI (see Federated learning).
        </p>
      </Card>
    </>
  );
}
