import { useMemo, useState } from 'react';
import { ArrowRight, Bug, CloudRain, Loader2, Siren, Sparkles, ThermometerSun, X } from 'lucide-react';
import { useApp } from '../App';
import { DISTRICTS, MED } from '../data/generate';
import { SEV_RANK, alertsFrom, analyse, type Alert } from '../data/engine';
import { generateScenario, type EventKind, type Scenario } from '../gemini';
import { Card, PageHead, SevBadge, SourceTag } from '../ui';

const EVENTS: { id: EventKind; label: string; icon: typeof Bug }[] = [
  { id: 'dengue', label: 'Dengue outbreak', icon: Bug },
  { id: 'flood', label: 'Flood', icon: CloudRain },
  { id: 'heatwave', label: 'Heatwave', icon: ThermometerSun },
];

export default function Emergency() {
  const { user, phcs, t, scenario: active, applyScenario, clearScenario, go } = useApp();
  const districts = DISTRICTS.filter((d) => (!user.stateId || d.stateId === user.stateId) && (!user.districtId || d.id === user.districtId));
  const [event, setEvent] = useState<EventKind>('flood');
  const [districtId, setDistrictId] = useState(districts[0].id);
  const [sc, setSc] = useState<Scenario | null>(null);
  const [mult, setMult] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const d = DISTRICTS.find((x) => x.id === districtId)!;

  const run = async () => {
    setBusy(true);
    const r = await generateScenario(event, d.name, d.stateName);
    setSc(r);
    setMult(Object.fromEntries(r.multipliers.map((m) => [m.medicineId, +m.multiplier.toFixed(2)])));
    setBusy(false);
  };

  // Before/after alerts for the chosen district only.
  const diff = useMemo(() => {
    if (!sc) return [];
    const dp = phcs.filter((p) => p.districtId === districtId);
    const idx = (as: Alert[]) => new Map(as.filter((a) => a.kind === 'stockout').map((a) => [`${a.phcId}|${a.medId}`, a]));
    const before = idx(alertsFrom(dp, analyse(dp))), after = idx(alertsFrom(dp, analyse(dp, { [districtId]: mult })));
    return [...after.entries()].map(([k, a]) => {
      const b = before.get(k);
      const status = !b ? 'New' : SEV_RANK[a.severity] < SEV_RANK[b.severity] ? 'Escalated' : a.daysLeft < b.daysLeft ? 'Sooner' : 'Unchanged';
      return { k, a, b, status, phc: dp.find((p) => p.id === a.phcId)! };
    }).filter((r) => r.status !== 'Unchanged').sort((x, y) => SEV_RANK[x.a.severity] - SEV_RANK[y.a.severity] || x.a.daysLeft - y.a.daysLeft);
  }, [sc, mult, phcs, districtId]);
  const label = `${EVENTS.find((e) => e.id === event)!.label} in ${d.name}`;
  const applied = active?.label === label;

  return (
    <>
      <PageHead title={t('Emergency mode')} sub="Declare an event, let Gemini propose demand multipliers, and see which alerts change before you apply it" />
      {active && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          <Siren size={18} /> <b>{t('Scenario active')}:</b> {active.label} — forecasts, alerts and transfers everywhere now include the surge.
          <button className="btn btn-danger ml-auto" onClick={clearScenario}><X size={15} />{t('Clear scenario')}</button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="1 · Event and district">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {EVENTS.map((e) => (
                <button key={e.id} aria-pressed={event === e.id} onClick={() => { setEvent(e.id); setSc(null); }}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-medium transition ${event === e.id ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <e.icon size={22} />{e.label}
                </button>
              ))}
            </div>
            <label className="block"><span className="label">District</span>
              <select className="field" value={districtId} onChange={(e) => { setDistrictId(e.target.value); setSc(null); }} disabled={districts.length === 1}>
                {districts.map((x) => <option key={x.id} value={x.id}>{x.name}, {x.stateName}</option>)}
              </select>
            </label>
            <button className="btn btn-ai w-full" onClick={run} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{t('Generate with Gemini')}</button>
          </div>
        </Card>

        <Card title="2 · Proposed demand multipliers" className="lg:col-span-2">
          {!sc ? <p className="text-sm text-slate-500">Pick an event and district, then generate. Gemini returns structured JSON (medicine id, multiplier, reason) which you can adjust before applying.</p> : (
            <>
              <p className="mb-1 text-sm text-slate-700">{sc.summary}</p>
              <p className="mb-3 text-xs text-slate-500">Duration ~{sc.durationDays} days · <SourceTag source={sc.source} /></p>
              <div className="-mx-4 overflow-x-auto md:-mx-5">
                <table className="tbl">
                  <thead><tr><th>{t('Medicine')}</th><th>Multiplier</th><th>{t('Reason')}</th></tr></thead>
                  <tbody>
                    {sc.multipliers.map((m) => (
                      <tr key={m.medicineId}>
                        <td className="font-medium whitespace-nowrap">{MED[m.medicineId].name}</td>
                        <td><input type="number" step="0.1" min="0.3" max="4" aria-label={`Multiplier for ${MED[m.medicineId].name}`} className="field w-20 py-1 tabular-nums"
                          value={mult[m.medicineId]} onChange={(e) => setMult({ ...mult, [m.medicineId]: Math.min(4, Math.max(0.3, +e.target.value || 1)) })} /></td>
                        <td className="text-slate-600">{m.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={applied} onClick={() => applyScenario(districtId, mult, label)}><Siren size={15} />{applied ? 'Applied' : t('Apply scenario')}</button>
                {applied && <button className="btn btn-secondary" onClick={() => go('alerts')}>{t('Alerts')} →</button>}
              </div>
            </>
          )}
        </Card>
      </div>

      {sc && (
        <Card title={`3 · Alerts that change in ${d.name} (${diff.length})`} className="mt-5">
          <div className="-mx-4 overflow-x-auto md:-mx-5">
            <table className="tbl">
              <thead><tr><th>{t('Facility')}</th><th>{t('Medicine')}</th><th>Before</th><th /><th>After</th><th>Change</th></tr></thead>
              <tbody>
                {diff.map(({ k, a, b, status, phc }) => (
                  <tr key={k}>
                    <td className="font-medium">{phc.name}</td>
                    <td>{MED[a.medId].name} <span className="text-xs text-slate-500">×{a.mult}</span></td>
                    <td>{b ? <span className="flex items-center gap-2"><SevBadge sev={b.severity} t={t} /><span className="tabular-nums text-slate-500">{b.daysLeft}d</span></span> : <span className="text-xs text-slate-400">no alert</span>}</td>
                    <td><ArrowRight size={14} className="text-slate-400" /></td>
                    <td><span className="flex items-center gap-2"><SevBadge sev={a.severity} t={t} /><span className="font-semibold tabular-nums">{a.daysLeft}d</span></span></td>
                    <td className={`text-xs font-semibold ${status === 'New' ? 'text-red-700' : status === 'Escalated' ? 'text-amber-700' : 'text-slate-600'}`}>{status}</td>
                  </tr>
                ))}
                {!diff.length && <tr><td colSpan={6} className="text-slate-500">No alert changes at these multipliers.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
