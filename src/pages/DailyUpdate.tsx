import { useState } from 'react';
import { CircleCheck, Clock, CloudOff, Loader2, Minus, Plus, RefreshCw, Send } from 'lucide-react';
import { useApp } from '../App';
import { AS_OF, MED, MEDICINES, isoDay } from '../data/generate';
import { key } from '../data/engine';
import type { DailyUpdate } from '../data/store';
import { Card, PageHead, fmt } from '../ui';

export default function DailyUpdatePage() {
  const { scoped, user, t, lines, alerts, submitUpdate, queue, online, forceOffline, setForceOffline, syncNow, syncing } = useApp();
  const [phcId, setPhcId] = useState(user.phcId ?? scoped[0].id);
  const p = scoped.find((x) => x.id === phcId)!;
  // Meds with alerts first, then the highest-volume ones.
  const defaults = [...new Set([...alerts.filter((a) => a.phcId === p.id).map((a) => a.medId), ...[...MEDICINES].sort((a, b) => b.daily - a.daily).map((m) => m.id)])].slice(0, 8);
  const [meds, setMeds] = useState<string[]>(defaults);
  const [issued, setIssued] = useState<Record<string, string>>({});
  const [opd, setOpd] = useState('');
  const [beds, setBeds] = useState(p.bedsOccupied);
  const [present, setPresent] = useState({ mo: p.staff.mo.present, nurse: p.staff.nurse.present, pharmacist: p.staff.pharmacist.present });
  const [saved, setSaved] = useState(false);
  const mine = queue.filter((u) => u.phcId === p.id);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = Object.fromEntries(meds.map((m) => [m, Math.max(0, Math.floor(+issued[m] || 0))]).filter(([, v]) => (v as number) > 0));
    const u: DailyUpdate = {
      id: `${p.id}-${isoDay(AS_OF)}-${Date.now()}`, phcId: p.id, date: isoDay(AS_OF), createdAt: new Date().toISOString(), synced: false,
      opd: Math.max(0, Math.floor(+opd || 0)), bedsOccupied: beds, present, issued: clean,
    };
    submitUpdate(u);
    setIssued({}); setOpd(''); setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHead title={t('Daily update')} sub={`${p.name} · ${AS_OF.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · about 2 minutes`} />

      <div className={`mb-4 flex items-center gap-3 rounded-xl p-3 text-sm ring-1 ${online ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-700 ring-slate-300'}`}>
        {online ? <CircleCheck size={18} /> : <CloudOff size={18} />}
        <span className="flex-1">{online ? `${t('Online')}: updates sync immediately` : `${t('Offline')}: updates are queued on this device and sync automatically when you reconnect`}</span>
        <label className="flex items-center gap-1.5 text-xs font-medium">
          <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={forceOffline} onChange={(e) => setForceOffline(e.target.checked)} /> Simulate offline
        </label>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {scoped.length > 1 && (
          <Card><label className="block"><span className="label">{t('Facility')}</span>
            <select className="field py-3 text-base" value={phcId} onChange={(e) => setPhcId(e.target.value)}>{scoped.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label></Card>
        )}
        <Card title="OPD & beds">
          <div className="grid grid-cols-2 gap-4">
            <label className="block"><span className="label">{t('OPD count today')}</span>
              <input required inputMode="numeric" type="number" min={0} max={2000} className="field py-3 text-lg tabular-nums" value={opd} onChange={(e) => setOpd(e.target.value)} placeholder={String(p.footfall.at(-1))} />
            </label>
            <div><span className="label">{t('Beds occupied')} (of {p.beds})</span><Stepper value={beds} max={p.beds} onChange={setBeds} label={t('Beds occupied')} /></div>
          </div>
        </Card>
        <Card title={t('Staff present today')}>
          <div className="space-y-3">
            {(['mo', 'nurse', 'pharmacist'] as const).map((r) => (
              <div key={r} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{t({ mo: 'Medical Officer', nurse: 'Nurse', pharmacist: 'Pharmacist' }[r])} <span className="text-slate-400">/ {p.staff[r].sanctioned}</span></span>
                <Stepper value={present[r]} max={p.staff[r].sanctioned} onChange={(v) => setPresent({ ...present, [r]: v })} label={t({ mo: 'Medical Officer', nurse: 'Nurse', pharmacist: 'Pharmacist' }[r])} />
              </div>
            ))}
          </div>
        </Card>
        <Card title={t('Medicines issued today')}>
          <div className="divide-y divide-slate-100">
            {meds.map((m) => {
              const stock = lines[key(p.id, m)].stock, v = +issued[m] || 0;
              return (
                <label key={m} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{MED[m].name}</span>
                    <span className={`block text-xs ${v > stock ? 'font-semibold text-red-700' : 'text-slate-500'}`}>{v > stock ? `More than stock (${fmt(stock)})` : `${t('Stock')}: ${fmt(stock)} ${MED[m].unit}s`}</span>
                  </span>
                  <input inputMode="numeric" type="number" min={0} max={stock} className="field w-28 py-2.5 text-right text-base tabular-nums" placeholder="0" value={issued[m] ?? ''} onChange={(e) => setIssued({ ...issued, [m]: e.target.value })} />
                </label>
              );
            })}
          </div>
          <select className="field mt-2" value="" onChange={(e) => e.target.value && setMeds([...meds, e.target.value])} aria-label="Add medicine">
            <option value="">+ Add another medicine</option>
            {MEDICINES.filter((m) => !meds.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Card>
        <button className="btn btn-primary w-full py-3.5 text-base" type="submit"><Send size={18} />{t('Submit update')}</button>
        {saved && <p role="status" className="rounded-xl bg-teal-50 p-3 text-center text-sm font-medium text-teal-800">{t('Update saved on this device')}{online ? ' · syncing…' : ' · will sync when back online'}</p>}
      </form>

      <Card title="This device's queue" className="mt-5" action={mine.some((u) => !u.synced) && online && <button className="btn btn-secondary py-1" onClick={syncNow} disabled={syncing}><RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />{t('Sync now')}</button>}>
        {!mine.length ? <p className="text-sm text-slate-500">No updates yet today.</p> : (
          <ul className="divide-y divide-slate-100">
            {mine.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">{new Date(u.createdAt).toLocaleTimeString('en-IN', { timeStyle: 'short' })} · OPD {u.opd} · {Object.keys(u.issued).length} medicines</span>
                {u.synced
                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CircleCheck size={14} />{t('Synced')}</span>
                  : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">{syncing ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}{t('Pending sync')}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className="grid h-11 w-11 place-items-center rounded-lg ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`Decrease ${label}`}><Minus size={16} /></button>
      <span className="w-10 text-center text-lg font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className="grid h-11 w-11 place-items-center rounded-lg ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}><Plus size={16} /></button>
    </div>
  );
}
