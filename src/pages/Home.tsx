import { useMemo } from 'react';
import { OctagonAlert, BedDouble, Building2, CalendarClock, ChevronRight, ClipboardPen, Network, PackageX, Siren, Stethoscope, Truck, Users, WifiOff, type LucideIcon } from 'lucide-react';
import { useApp } from '../App';
import { AS_OF, GEO, MED, isoDay } from '../data/generate';
import { riskScore, summarise } from '../data/engine';
import { alertTitle } from '../i18n';
import MapView from '../MapView';
import { Card, Kpi, PageHead, SevBadge, fmt } from '../ui';

interface Action { icon: LucideIcon; tone: 'red' | 'amber' | 'teal'; title: string; sub?: string; onClick: () => void }

export default function Home() {
  const { user, t, lang, scoped, alerts, transfers, byId, go, queue } = useApp();
  const ids = useMemo(() => new Set(scoped.map((p) => p.id)), [scoped]);
  const mine = alerts.filter((a) => ids.has(a.phcId));
  const s = summarise(scoped, alerts);
  const myTransfers = transfers.filter((x) => ids.has(x.toId) || ids.has(x.fromId));
  const critical = mine.filter((a) => a.severity === 'critical' && a.kind === 'stockout');
  const actions: Action[] = [];

  if (user.role === 'pharmacist') {
    const p = byId[user.phcId!];
    if (!queue.some((u) => u.phcId === p.id && u.date === isoDay(AS_OF)))
      actions.push({ icon: ClipboardPen, tone: 'amber', title: t("Submit today's daily update"), sub: 'Stock issued, OPD, beds and attendance · about 2 minutes, works offline', onClick: () => go('update') });
    for (const a of mine.filter((a) => a.severity !== 'watch').slice(0, 4))
      actions.push({
        icon: a.kind === 'expiry' ? CalendarClock : PackageX, tone: a.severity === 'critical' ? 'red' : 'amber',
        title: a.kind === 'expiry' ? `Issue lot ${a.batch} of ${MED[a.medId].name} first` : `Raise indent: ${MED[a.medId].name}`,
        sub: alertTitle(a, p, lang), onClick: () => go('forecast', { phc: a.phcId, med: a.medId }),
      });
    for (const x of myTransfers.filter((x) => x.toId === p.id).slice(0, 2))
      actions.push({ icon: Truck, tone: 'teal', title: `Incoming transfer proposed: ${fmt(x.qty)} × ${MED[x.medId].name}`, sub: `From ${byId[x.fromId].name}, ${byId[x.fromId].district} · awaiting officer approval`, onClick: () => go('alerts') });
  } else {
    if (myTransfers.length && user.role !== 'national')
      actions.push({ icon: Truck, tone: 'teal', title: `Review ${myTransfers.length} proposed transfers`, sub: `Top: ${fmt(myTransfers[0].qty)} × ${MED[myTransfers[0].medId].name} → ${byId[myTransfers[0].toId].name} (${myTransfers[0].dstBefore} days left)`, onClick: () => go('redistribution') });
    if (critical.length)
      actions.push({ icon: OctagonAlert, tone: 'red', title: `${critical.length} critical stock-outs at ${new Set(critical.map((a) => a.phcId)).size} PHCs`, sub: critical.slice(0, 3).map((a) => `${byId[a.phcId].name}: ${MED[a.medId].name} (${a.daysLeft}d)`).join(' · '), onClick: () => go('alerts', { sev: 'critical' }) });
    const late = scoped.filter((p) => p.lastReportDays > 0);
    if (late.length)
      actions.push({ icon: WifiOff, tone: 'amber', title: `${late.length} PHCs have not reported today`, sub: late.slice(0, 4).map((p) => `${p.name} (${p.lastReportDays}d)`).join(' · '), onClick: () => go('dashboard') });
    const noMo = scoped.filter((p) => p.staff.mo.present === 0);
    if (noMo.length && user.role !== 'national')
      actions.push({ icon: Stethoscope, tone: 'amber', title: `Medical Officer absent at ${noMo.length} PHCs today`, sub: noMo.slice(0, 4).map((p) => p.name).join(' · '), onClick: () => go('dashboard') });
    const exp = mine.filter((a) => a.kind === 'expiry');
    if (exp.length)
      actions.push({ icon: CalendarClock, tone: 'amber', title: `${exp.length} near-expiry lot${exp.length > 1 ? 's' : ''} at risk of waste`, sub: exp.slice(0, 2).map((a) => `${fmt(a.wasteQty!)} × ${MED[a.medId].name} at ${byId[a.phcId].name}, ${a.expiryDays}d`).join(' · '), onClick: () => go('alerts') });
    if (user.role === 'state' || user.role === 'district')
      actions.push({ icon: Siren, tone: 'teal', title: 'Plan for a surge: run an emergency scenario', sub: 'Dengue, flood or heatwave · Gemini proposes demand multipliers', onClick: () => go('emergency') });
    if (user.role === 'national' || user.role === 'state')
      actions.push({ icon: Network, tone: 'teal', title: 'Federated model: run the next training round', sub: 'Raw state data never leaves the state node', onClick: () => go('federated') });
  }

  const points = useMemo(() => scoped.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, risk: riskScore(p.id, alerts), label: `${p.name}, ${p.district}` })), [scoped, alerts]);
  const tones = { red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', teal: 'bg-teal-50 text-teal-700' };
  const greeting = lang === 'hi' ? 'नमस्ते' : 'Good morning';

  return (
    <>
      <PageHead title={`${greeting}, ${user.name.split(',')[0]}`} sub={`${t(user.title)} · ${AS_OF.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {user.role !== 'pharmacist' && <Kpi icon={Building2} label={t('PHCs')} value={s.phcs} sub={`${s.reporting} ${t('Reporting today').toLowerCase()}`} />}
        <Kpi icon={OctagonAlert} tone="red" label={t('Critical alerts')} value={s.critical} sub="≤ 7 days of stock" />
        <Kpi icon={PackageX} tone="amber" label={t('Warnings')} value={s.warning} sub="8-14 days of stock" />
        <Kpi icon={BedDouble} label={t('Beds available')} value={`${s.bedsFree}/${s.beds}`} sub={`${Math.round((100 * s.bedsFree) / s.beds)}% free`} />
        <Kpi icon={Users} label={t('Staff present')} value={`${Math.round((100 * s.staffPresent) / s.staff)}%`} sub={`${s.staffPresent} of ${s.staff} sanctioned`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card title={t('What needs my action today?')} className="lg:col-span-3">
          {actions.length ? (
            <ul className="space-y-2">
              {actions.map((a, i) => (
                <li key={i}>
                  <button onClick={a.onClick} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tones[a.tone]}`}><a.icon size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-800">{a.title}</span>
                      {a.sub && <span className="block truncate text-sm text-slate-500">{a.sub}</span>}
                    </span>
                    <ChevronRight size={18} className="text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-slate-500">{t('Nothing urgent. All clear.')}</p>}
        </Card>

        {user.role === 'pharmacist' ? (
          <PhcToday />
        ) : (
          <Card title={t('Stock-out risk map')} className="lg:col-span-2">
            <MapView points={points} height={300} onSelect={(id) => user.role !== 'national' && go('dashboard', { phc: id })} />
          </Card>
        )}
      </div>

      {user.role === 'national' ? <StateTable /> : (
        <Card title={t('Top alerts')} className="mt-5" action={<button className="text-sm font-medium text-teal-700" onClick={() => go('alerts')}>{t('Alerts')} →</button>}>
          <ul className="divide-y divide-slate-100">
            {mine.slice(0, 6).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <SevBadge sev={a.severity} t={t} />
                <span className="min-w-0 flex-1 text-sm">{alertTitle(a, byId[a.phcId], lang)}</span>
                <span className="text-xs text-slate-500">{byId[a.phcId].district}</span>
              </li>
            ))}
            {!mine.length && <li className="py-2 text-slate-500">{t('Nothing urgent. All clear.')}</li>}
          </ul>
        </Card>
      )}
    </>
  );
}

function PhcToday() {
  const { byId, user, t } = useApp();
  const p = byId[user.phcId!];
  const rows: [string, string][] = [
    [t('Beds'), `${p.beds - p.bedsOccupied} free of ${p.beds}`],
    [t('Medical Officer'), `${p.staff.mo.present}/${p.staff.mo.sanctioned} present`],
    [t('Nurse'), `${p.staff.nurse.present}/${p.staff.nurse.sanctioned} present`],
    [t('Pharmacist'), `${p.staff.pharmacist.present}/${p.staff.pharmacist.sanctioned} present`],
    ['OPD (last day)', String(p.footfall.at(-1))],
    ['Last report', p.lastReportDays ? `${p.lastReportDays} day(s) ago` : 'Today'],
  ];
  return (
    <Card title={p.name} className="lg:col-span-2">
      <p className="-mt-2 mb-3 text-sm text-slate-500">{p.block} block · {p.district}, {p.state} · pop. {fmt(p.population)}</p>
      <dl className="divide-y divide-slate-100 text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}
      </dl>
    </Card>
  );
}

function StateTable() {
  const { phcs, alerts, t } = useApp();
  return (
    <Card title="State comparison (aggregated — no facility-level raw data)" className="mt-5">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>State</th><th>{t('PHCs')}</th><th>{t('Critical')}</th><th>{t('Warning')}</th><th>{t('Watch')}</th><th>{t('Reporting today')}</th><th>{t('Beds available')}</th><th>{t('Staff present')}</th></tr></thead>
          <tbody>
            {GEO.map((g) => {
              const s = summarise(phcs.filter((p) => p.stateId === g.id), alerts);
              return (
                <tr key={g.id}>
                  <td className="font-medium">{g.name}</td><td>{s.phcs}</td>
                  <td className="font-semibold text-red-700">{s.critical}</td><td className="text-amber-700">{s.warning}</td><td>{s.watch}</td>
                  <td>{Math.round((100 * s.reporting) / s.phcs)}%</td><td>{Math.round((100 * s.bedsFree) / s.beds)}%</td><td>{Math.round((100 * s.staffPresent) / s.staff)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
