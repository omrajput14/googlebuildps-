import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BedDouble, ChevronRight, Eye, OctagonAlert, Stethoscope, TriangleAlert, Users, Activity, CalendarCheck } from 'lucide-react';
import { useApp } from '../App';
import { DISTRICTS, GEO, MEDICINES, dateOf, daysUntil, type PHC } from '../data/generate';
import { key, riskScore, severityFor, summarise } from '../data/engine';
import MapView from '../MapView';
import { Card, DaysPill, Kpi, PageHead, SevBadge, fmt } from '../ui';

export default function Dashboard() {
  const { user, params, go, phcs, alerts, byId, t } = useApp();
  const national = user.role === 'national';
  // Scope is enforced here: officers cannot navigate above their own level.
  const phc = !national && params.phc && byId[params.phc] && (!user.districtId || byId[params.phc].districtId === user.districtId) && (!user.stateId || byId[params.phc].stateId === user.stateId) ? byId[params.phc] : undefined;
  const stateId = user.stateId ?? phc?.stateId ?? params.state;
  const districtId = user.districtId ?? phc?.districtId ?? params.district;
  const block = national ? undefined : phc?.block ?? params.block;

  const nodePhcs = useMemo(() => phcs.filter((p) => (!stateId || p.stateId === stateId) && (!districtId || p.districtId === districtId) && (!block || p.block === block) && (!phc || p.id === phc.id)), [phcs, stateId, districtId, block, phc]);
  const stateName = GEO.find((g) => g.id === stateId)?.name;
  const district = DISTRICTS.find((d) => d.id === districtId);

  type Child = { id: string; name: string; phcs: PHC[]; go: () => void };
  let children: Child[] = [];
  if (!stateId) children = GEO.map((g) => ({ id: g.id, name: g.name, phcs: phcs.filter((p) => p.stateId === g.id), go: () => go('dashboard', { state: g.id }) }));
  else if (!districtId) children = DISTRICTS.filter((d) => d.stateId === stateId).map((d) => ({ id: d.id, name: d.name, phcs: phcs.filter((p) => p.districtId === d.id), go: () => go('dashboard', { state: stateId, district: d.id }) }));
  else if (!block && !national) children = district!.blocks.map((b) => ({ id: b, name: `${b} block`, phcs: nodePhcs.filter((p) => p.block === b), go: () => go('dashboard', { state: stateId, district: districtId, block: b }) }));
  else if (!phc && !national) children = nodePhcs.map((p) => ({ id: p.id, name: p.name, phcs: [p], go: () => go('dashboard', { phc: p.id }) }));

  const crumbs: { label: string; to?: Record<string, string> }[] = [{ label: 'India', to: national ? {} : undefined }];
  if (stateName) crumbs.push({ label: stateName, to: user.role === 'district' ? undefined : { state: stateId! } });
  if (district) crumbs.push({ label: district.name, to: { state: stateId!, district: districtId! } });
  if (block) crumbs.push({ label: `${block} block`, to: { state: stateId!, district: districtId!, block } });
  if (phc) crumbs.push({ label: phc.name });

  const s = summarise(nodePhcs, alerts);
  const points = useMemo(() => nodePhcs.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, risk: riskScore(p.id, alerts), label: `${p.name} · ${p.block}, ${p.district}`, highlight: p.id === phc?.id })), [nodePhcs, alerts, phc]);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-slate-500">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} />}
            {c.to && i < crumbs.length - 1 ? <button className="font-medium text-teal-700 hover:underline" onClick={() => go('dashboard', c.to)}>{c.label}</button> : <span className={i === crumbs.length - 1 ? 'font-semibold text-slate-800' : ''}>{c.label}</span>}
          </span>
        ))}
      </nav>
      <PageHead title={phc?.name ?? (block ? `${block} block` : district?.name ?? stateName ?? 'All pilot states')} sub={phc ? `${phc.block} block · ${phc.district}, ${phc.state} · population served ${fmt(phc.population)}` : `${s.phcs} PHCs · live stock, beds and staff`} />

      {!phc && <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={OctagonAlert} tone="red" label={t('Critical alerts')} value={s.critical} sub={`${s.warning} warnings · ${s.watch} watch`} />
        <Kpi icon={BedDouble} label={t('Beds available')} value={`${s.bedsFree}/${s.beds}`} sub={`${Math.round((100 * s.bedsFree) / s.beds)}% free`} />
        <Kpi icon={Users} label={t('Staff present')} value={`${Math.round((100 * s.staffPresent) / s.staff)}%`} sub={`${s.staffPresent}/${s.staff} sanctioned posts`} />
        <Kpi icon={CalendarCheck} tone={s.reporting < s.phcs ? 'amber' : 'teal'} label={t('Reporting today')} value={`${s.reporting}/${s.phcs}`} sub="data freshness" />
      </div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          {phc ? <PhcDetail p={phc} /> : (
            <Card title={national && districtId ? 'District aggregate (facility drill-down is not available at national level)' : 'Drill down'}>
              <div className="grid gap-3 sm:grid-cols-2">
                {children.map((c) => <ChildCard key={c.id} c={c} />)}
              </div>
              {!children.length && <p className="text-sm text-slate-500">National view stops at district level: facility-level data stays with the state.</p>}
            </Card>
          )}
        </div>
        <Card title={t('Stock-out risk map')} className="h-fit lg:col-span-2">
          <MapView points={points} height={phc ? 280 : 420} onSelect={national ? undefined : (id) => go('dashboard', { phc: id })} />
        </Card>
      </div>
    </>
  );
}

function ChildCard({ c }: { c: { name: string; phcs: PHC[]; go: () => void } }) {
  const { alerts, t } = useApp();
  const s = summarise(c.phcs, alerts);
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
  return (
    <button onClick={c.go} className="rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-teal-400 hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{c.name}</span>
        <span className="text-xs text-slate-500">{s.phcs > 1 ? `${s.phcs} PHCs` : c.phcs[0]?.block}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium">
        <span className="flex items-center gap-1 text-red-700"><OctagonAlert size={13} />{s.critical} {t('Critical')}</span>
        <span className="flex items-center gap-1 text-amber-700"><TriangleAlert size={13} />{s.warning} {t('Warning')}</span>
        <span className="flex items-center gap-1 text-sky-700"><Eye size={13} />{s.watch} {t('Watch')}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <span><BedDouble size={12} className="mr-1 inline" />{pct(s.bedsFree, s.beds)}% free</span>
        <span><Users size={12} className="mr-1 inline" />{pct(s.staffPresent, s.staff)}% staff</span>
        <span><Activity size={12} className="mr-1 inline" />{pct(s.reporting, s.phcs)}% rep.</span>
      </div>
    </button>
  );
}

function PhcDetail({ p }: { p: PHC }) {
  const { lines, go, t } = useApp();
  const rows = MEDICINES.map((m) => ({ m, l: lines[key(p.id, m.id)], exp: p.stock[m.id].batches[0] })).sort((a, b) => a.l.daysLeft - b.l.daysLeft);
  const foot = p.footfall.map((v, i) => ({ d: dateOf(i).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), v }));
  const st = p.staff;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={BedDouble} label={t('Beds')} value={`${p.beds - p.bedsOccupied}/${p.beds}`} sub="free" />
        <Kpi icon={Stethoscope} tone={st.mo.present ? 'teal' : 'red'} label={t('Medical Officer')} value={`${st.mo.present}/${st.mo.sanctioned}`} sub="present" />
        <Kpi icon={Users} label={`${t('Nurse')} · ${t('Pharmacist')}`} value={`${st.nurse.present}/${st.nurse.sanctioned} · ${st.pharmacist.present}/${st.pharmacist.sanctioned}`} sub={`30-day attendance ${Math.round(p.attendance30 * 100)}%`} />
        <Kpi icon={Activity} tone={p.lastReportDays ? 'amber' : 'teal'} label="OPD (last day)" value={p.footfall.at(-1)} sub={p.lastReportDays ? `last report ${p.lastReportDays}d ago` : 'reported today'} />
      </div>
      <Card title="Medicine stock (sorted by days left)">
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="tbl">
            <thead><tr><th>{t('Medicine')}</th><th className="text-right">{t('Stock')}</th><th className="text-right">Avg/day</th><th className="text-right">{t('Days left')} (P50)</th><th className="text-right">High demand (P90)</th><th>Next expiry</th><th>{t('Severity')}</th></tr></thead>
            <tbody>
              {rows.map(({ m, l, exp }) => {
                const sev = severityFor(l.daysLeft), ed = exp ? daysUntil(exp.expiry) : 999;
                return (
                  <tr key={m.id} className="cursor-pointer hover:bg-teal-50/50" onClick={() => go('forecast', { phc: p.id, med: m.id })}>
                    <td className="font-medium">{m.name}</td>
                    <td className="text-right tabular-nums">{fmt(l.stock)}</td>
                    <td className="text-right tabular-nums">{l.avgDaily.toFixed(1)}</td>
                    <td className="text-right"><DaysPill days={l.daysLeft} /></td>
                    <td className="text-right"><DaysPill days={l.daysLeftP90} /></td>
                    <td className={`whitespace-nowrap text-xs ${ed <= 45 ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{exp ? `${exp.expiry} (${ed}d)` : '—'}</td>
                    <td>{sev ? <SevBadge sev={sev} t={t} /> : <span className="text-xs text-slate-400">OK</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Daily OPD footfall (90 days)">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={foot} margin={{ left: -20, right: 8 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="d" tick={{ fontSize: 11 }} interval={14} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area dataKey="v" name="OPD" stroke="#0d9488" fill="#ccfbf1" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </>
  );
}
