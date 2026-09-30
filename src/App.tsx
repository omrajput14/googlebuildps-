import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bell, BrainCircuit, Building2, ClipboardPen, Cloud, CloudOff, House, Landmark, Languages, LayoutDashboard, Loader2, LogOut,
  MessageSquare, Network, Pill, Siren, TrendingUp, Truck, Globe, X,
} from 'lucide-react';
import { AS_OF, DEMO_USERS, DISTRICTS, MED, type PHC, type Role, type User } from './data/generate';
import { alertsFrom, analyse, inScope, proposeTransfers, type Alert, type Line, type Multipliers, type Transfer } from './data/engine';
import { addAudit, backend, loadAudit, loadPhcs, loadQueue, saveQueue, signIn, signOut, syncPending, type AuditEntry, type DailyUpdate } from './data/store';
import { translate, type Lang } from './i18n';
import { PrivacyBadge } from './ui';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Forecast from './pages/Forecast';
import Alerts from './pages/Alerts';
import Emergency from './pages/Emergency';
import Redistribution from './pages/Redistribution';
import Federated from './pages/Federated';
import Ask from './pages/Ask';
import DailyUpdatePage from './pages/DailyUpdate';

// ---------------- App state ----------------
type Params = Record<string, string>;
interface Scenario { label: string; districtId: string }
interface AppCtx {
  user: User; lang: Lang; t: (s: string) => string;
  phcs: PHC[]; byId: Record<string, PHC>; scoped: PHC[];
  lines: Record<string, Line>; alerts: Alert[]; transfers: Transfer[];
  mults: Multipliers; scenario: Scenario | null;
  applyScenario: (districtId: string, m: Record<string, number>, label: string) => void; clearScenario: () => void;
  audit: AuditEntry[]; decide: (tr: Transfer, action: 'approved' | 'rejected', reason: string) => void;
  queue: DailyUpdate[]; online: boolean; forceOffline: boolean; setForceOffline: (v: boolean) => void;
  submitUpdate: (u: DailyUpdate) => void; syncNow: () => void; syncing: boolean;
  params: Params; go: (page: string, params?: Params) => void;
}
const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);

const PAGES: Record<string, { label: string; icon: typeof House; el: () => ReactNode }> = {
  home: { label: 'Home', icon: House, el: () => <Home /> },
  update: { label: 'Daily update', icon: ClipboardPen, el: () => <DailyUpdatePage /> },
  dashboard: { label: 'Dashboard', icon: LayoutDashboard, el: () => <Dashboard /> },
  alerts: { label: 'Alerts', icon: Bell, el: () => <Alerts /> },
  forecast: { label: 'Forecast', icon: TrendingUp, el: () => <Forecast /> },
  redistribution: { label: 'Redistribution', icon: Truck, el: () => <Redistribution /> },
  emergency: { label: 'Emergency mode', icon: Siren, el: () => <Emergency /> },
  federated: { label: 'Federated learning', icon: Network, el: () => <Federated /> },
  ask: { label: 'Ask SwasthChain', icon: MessageSquare, el: () => <Ask /> },
};
const NAV: Record<Role, string[]> = {
  pharmacist: ['home', 'update', 'alerts', 'forecast', 'ask'],
  district: ['home', 'dashboard', 'alerts', 'forecast', 'redistribution', 'emergency', 'ask'],
  state: ['home', 'dashboard', 'alerts', 'forecast', 'redistribution', 'emergency', 'federated', 'ask'],
  national: ['home', 'dashboard', 'alerts', 'federated', 'ask'],
};

const readLS = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') ?? d; } catch { return d; } };
const writeLS = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const parseHash = () => {
  const [page, qs] = location.hash.replace(/^#\/?/, '').split('?');
  return { page: page || 'home', params: Object.fromEntries(new URLSearchParams(qs)) };
};

/** Remove qty from a stock line FEFO (or from a named lot first). */
function take(p: PHC, medId: string, qty: number, lot?: string): PHC {
  const line = p.stock[medId];
  const batches = [...line.batches].sort((a, b) => (a.batch === lot ? -1 : b.batch === lot ? 1 : a.expiry.localeCompare(b.expiry))).map((b) => ({ ...b }));
  let left = qty;
  for (const b of batches) { const d = Math.min(b.qty, left); b.qty -= d; left -= d; }
  const kept = batches.filter((b) => b.qty > 0).sort((a, b) => a.expiry.localeCompare(b.expiry));
  return { ...p, stock: { ...p.stock, [medId]: { ...line, batches: kept, stock: kept.reduce((s, b) => s + b.qty, 0) } } };
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => readLS('sc_user', null));
  const [lang, setLang] = useState<Lang>(() => readLS('sc_lang', 'en'));
  const [phcs, setPhcs] = useState<PHC[] | null>(null);
  const [route, setRoute] = useState(parseHash);
  const [mults, setMults] = useState<Multipliers>({});
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>(loadAudit);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<DailyUpdate[]>(loadQueue);
  const [netOnline, setNetOnline] = useState(navigator.onLine);
  const [forceOffline, setForceOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const online = netOnline && !forceOffline;

  useEffect(() => writeLS('sc_lang', lang), [lang]);
  useEffect(() => saveQueue(queue), [queue]);
  useEffect(() => {
    const h = () => setRoute(parseHash());
    const on = () => setNetOnline(true), off = () => setNetOnline(false);
    addEventListener('hashchange', h); addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('hashchange', h); removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  useEffect(() => { if (user && !phcs) loadPhcs().then(setPhcs); }, [user, phcs]);

  const t = useCallback((s: string) => translate(lang, s), [lang]);
  const lines = useMemo(() => (phcs ? analyse(phcs, mults) : {}), [phcs, mults]);
  const alerts = useMemo(() => (phcs ? alertsFrom(phcs, lines) : []), [phcs, lines]);
  const transfers = useMemo(() => (phcs ? proposeTransfers(phcs, lines, decided) : []), [phcs, lines, decided]);
  const byId = useMemo(() => Object.fromEntries((phcs ?? []).map((p) => [p.id, p])), [phcs]);
  const scoped = useMemo(() => (phcs && user ? phcs.filter((p) => inScope(p, user)) : []), [phcs, user]);

  const log = useCallback((action: string, detail: string, reason = '') => {
    if (!user) return;
    const e: AuditEntry = { at: new Date().toISOString(), by: user.name, role: user.role, action, detail, reason };
    setAudit((a) => [e, ...a]);
    addAudit(e).catch((err) => console.warn('audit write failed', err));
  }, [user]);

  // Apply synced daily updates to facility state.
  const applyUpdates = useCallback((done: DailyUpdate[]) => {
    const ids = new Set(done.map((u) => u.id));
    setQueue((q) => q.map((u) => (ids.has(u.id) ? { ...u, synced: true } : u)));
    setPhcs((ps) => ps && ps.map((p) => done.filter((u) => u.phcId === p.id).reduce((acc, u) => {
      let next = Object.entries(u.issued).reduce((x, [m, q]) => (q > 0 ? take(x, m, q) : x), acc);
      const s = next.staff;
      next = {
        ...next, bedsOccupied: Math.min(next.beds, u.bedsOccupied), lastReportDays: 0, footfall: [...next.footfall.slice(0, -1), u.opd],
        staff: { mo: { ...s.mo, present: u.present.mo }, nurse: { ...s.nurse, present: u.present.nurse }, pharmacist: { ...s.pharmacist, present: u.present.pharmacist } },
      };
      return next;
    }, p)));
  }, []);

  const syncNow = useCallback(async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try { applyUpdates(await syncPending(queue)); } catch (e) { console.warn('sync failed; will retry', e); } finally { setSyncing(false); }
  }, [online, syncing, queue, applyUpdates]);
  useEffect(() => { if (online && !syncing && queue.some((u) => !u.synced)) syncNow(); }, [online, queue]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Login lang={lang} setLang={setLang} onLogin={(u) => { writeLS('sc_user', u); setUser(u); }} />;
  if (!phcs) return <div className="grid h-screen place-items-center text-teal-700"><Loader2 className="animate-spin" /></div>;

  const nav = NAV[user.role];
  const page = nav.includes(route.page) ? route.page : 'home';
  const pending = queue.filter((u) => !u.synced).length;

  const value: AppCtx = {
    user, lang, t, phcs, byId, scoped, lines, alerts, transfers, mults, scenario, audit, queue, online, forceOffline, setForceOffline, syncing,
    params: route.params,
    go: (p, params) => { location.hash = `/${p}${params ? '?' + new URLSearchParams(params) : ''}`; scrollTo(0, 0); },
    applyScenario: (districtId, m, label) => {
      setMults({ [districtId]: m });
      setScenario({ districtId, label });
      log('scenario applied', `${label} — ${Object.entries(m).map(([k, v]) => `${MED[k].name} ×${v}`).join(', ')}`);
    },
    clearScenario: () => { if (scenario) log('scenario cleared', scenario.label); setMults({}); setScenario(null); },
    decide: (tr, action, reason) => {
      setDecided((s) => new Set(s).add(`${tr.medId}|${tr.fromId}|${tr.toId}`));
      const from = byId[tr.fromId], to = byId[tr.toId];
      log(`transfer ${action}`, `${tr.qty} × ${MED[tr.medId].name}: ${from.name} (${from.district}) → ${to.name} (${to.district}), ${tr.distanceKm} km, ₹${tr.cost}`, reason);
      if (action === 'approved') {
        const lot = from.stock[tr.medId].batches.find((b) => b.batch === tr.lot);
        setPhcs((ps) => ps && ps.map((p) => {
          if (p.id === tr.fromId) return take(p, tr.medId, tr.qty, tr.lot);
          if (p.id !== tr.toId) return p;
          const l = p.stock[tr.medId];
          const batches = [...l.batches, { batch: tr.lot, expiry: lot?.expiry ?? l.batches[0]?.expiry, qty: tr.qty }].sort((a, b) => a.expiry.localeCompare(b.expiry));
          return { ...p, stock: { ...p.stock, [tr.medId]: { ...l, batches, stock: l.stock + tr.qty } } };
        }));
      }
    },
    submitUpdate: (u) => setQueue((q) => [u, ...q]),
    syncNow,
  };

  return (
    <Ctx.Provider value={value}>
      <div className="min-h-screen bg-slate-50 text-slate-800">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <Logo />
            {scenario && (
              <span className="hidden items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200 lg:flex">
                <Siren size={14} /> {t('Scenario active')}: {scenario.label}
                <button onClick={value.clearScenario} aria-label={t('Clear scenario')} className="ml-1 rounded hover:bg-red-100"><X size={14} /></button>
              </span>
            )}
            <div className="flex-1" />
            <span className="hidden xl:block"><PrivacyBadge lang={lang} /></span>
            <button onClick={syncNow} title={online ? t('Online') : t('Offline')}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${online ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-300'}`}>
              {syncing ? <Loader2 size={14} className="animate-spin" /> : online ? <Cloud size={14} /> : <CloudOff size={14} />}
              <span className="hidden sm:inline">{online ? t('Online') : t('Offline')}</span>
              {pending > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-white">{pending} {t('pending sync')}</span>}
            </button>
            <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-teal-800 hover:bg-teal-50" aria-label="Language">
              <Languages size={16} /> {lang === 'en' ? 'हिंदी' : 'English'}
            </button>
            <div className="hidden text-right leading-tight md:block">
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-xs text-slate-500">{t(user.title)} · {scopeLabel(user, byId)}</div>
            </div>
            <button onClick={() => { signOut(); localStorage.removeItem('sc_user'); setUser(null); setPhcs(null); location.hash = ''; }}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={t('Sign out')} aria-label={t('Sign out')}><LogOut size={18} /></button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:hidden">
            {nav.map((k) => <NavItem key={k} k={k} active={k === page} t={t} compact />)}
          </nav>
        </header>
        <div className="flex">
          <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-60 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-3 md:flex">
            {nav.map((k) => <NavItem key={k} k={k} active={k === page} t={t} />)}
            <div className="mt-auto space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              <div>{t('Data as of')}: <b className="text-slate-700">{AS_OF.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>
              <div>Backend: <b className="text-slate-700">{backend === 'firebase' ? 'Firebase' : 'Local demo data'}</b></div>
              <PrivacyBadge />
            </div>
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-6">
            <div className="mx-auto max-w-7xl">{PAGES[page].el()}</div>
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

function scopeLabel(u: User, byId: Record<string, PHC>) {
  if (u.phcId) return byId[u.phcId]?.name ?? u.phcId;
  if (u.districtId) return DISTRICTS.find((d) => d.id === u.districtId)?.name;
  if (u.stateId) return DISTRICTS.find((d) => d.stateId === u.stateId)?.stateName;
  return 'All pilot states';
}

function NavItem({ k, active, t, compact }: { k: string; active: boolean; t: (s: string) => string; compact?: boolean }) {
  const { label, icon: Icon } = PAGES[k];
  return (
    <a href={`#/${k}`} aria-current={active ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-2.5 rounded-lg font-medium transition ${compact ? 'px-3 py-1.5 text-sm' : 'px-3 py-2 text-sm'} ${active ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-teal-50 hover:text-teal-800'}`}>
      <Icon size={17} /> {t(label)}
    </a>
  );
}

function Logo() {
  return (
    <a href="#/home" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-700 text-white"><Pill size={17} /></span>
      <span className="text-lg font-bold tracking-tight text-teal-900">Swasth<span className="text-teal-600">Chain</span></span>
    </a>
  );
}

// ---------------- Login ----------------
const ROLE_CARDS: { role: Role; icon: typeof House; blurb: string }[] = [
  { role: 'pharmacist', icon: Building2, blurb: 'PHC Mocharim, Gaya · daily stock entry, my alerts' },
  { role: 'district', icon: Landmark, blurb: 'Gaya district · approve transfers, chase reporting' },
  { role: 'state', icon: BrainCircuit, blurb: 'Bihar · heatmap, emergency scenarios, audit' },
  { role: 'national', icon: Globe, blurb: 'All pilot states · aggregated trends, model performance' },
];

function Login({ lang, setLang, onLogin }: { lang: Lang; setLang: (l: Lang) => void; onLogin: (u: User) => void }) {
  const t = (s: string) => translate(lang, s);
  const [busy, setBusy] = useState<Role | null>(null);
  const [err, setErr] = useState('');
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col justify-between bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-700 p-8 text-white md:p-12">
        <div className="flex items-center gap-2 text-xl font-bold"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15"><Pill size={19} /></span>SwasthChain</div>
        <div className="my-10">
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">Every PHC stocked.<br />Every stock-out seen 14 days early.</h1>
          <p className="mt-4 max-w-md text-teal-50/90">A federated AI platform for medicines, beds and staff across India's Primary Health Centres. State data stays with the state; only model learning is shared.</p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            {['Gemini', 'Google Maps', 'Firebase', 'Cloud Run'].map((g) => <span key={g} className="rounded-full bg-white/15 px-3 py-1">{g}</span>)}
          </div>
        </div>
        <PrivacyBadge dark />
      </div>
      <div className="flex flex-col justify-center p-6 md:p-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t('Choose a demo role')}</h2>
          <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-teal-800 hover:bg-teal-50"><Languages size={16} /> {lang === 'en' ? 'हिंदी' : 'English'}</button>
        </div>
        <div className="grid gap-3">
          {ROLE_CARDS.map(({ role, icon: Icon, blurb }) => (
            <button key={role} disabled={!!busy}
              onClick={async () => { setBusy(role); setErr(''); try { onLogin(await signIn(role)); } catch (e) { setErr(String((e as Error).message)); setBusy(null); } }}
              className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-400 hover:shadow-md disabled:opacity-60">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-teal-700 group-hover:bg-teal-600 group-hover:text-white">{busy === role ? <Loader2 className="animate-spin" size={20} /> : <Icon size={20} />}</span>
              <span className="flex-1">
                <span className="block font-semibold">{t(DEMO_USERS[role].title)} <span className="font-normal text-slate-500">— {DEMO_USERS[role].name}</span></span>
                <span className="block text-sm text-slate-500">{blurb}</span>
              </span>
            </button>
          ))}
        </div>
        {err && <p role="alert" className="mt-3 text-sm text-red-700">{err}</p>}
        <p className="mt-6 text-xs text-slate-500">{backend === 'firebase' ? 'Signs in with Firebase Authentication (role from custom claims).' : 'Local demo mode: no Firebase config found, using seeded mock data in the browser.'}</p>
      </div>
    </div>
  );
}
