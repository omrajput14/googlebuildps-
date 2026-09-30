// Browser side of Gemini: calls the server proxy (/api/gemini), runs function calls against app data,
// and falls back to deterministic templates when Gemini is unreachable (so the demo never dead-ends).
import { AS_OF, DISTRICTS, GEO, MED, MEDICINES, isoDay, type PHC, type User } from './data/generate';
import { key, summarise, type Alert, type Line, type Transfer } from './data/engine';
import type { Lang } from './i18n';

export type Source = 'gemini' | 'fallback';

async function call(task: string, payload: unknown) {
  const r = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, payload }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Gemini proxy ${r.status}`);
  return body as { text: string; functionCalls: { name: string; args: Record<string, unknown>; id?: string }[]; content: unknown };
}

// ---------- Alert explanation ----------
export interface Explanation { explanation: string; action: string; source: Source }

export async function explainAlert(a: Alert, p: PHC, lang: Lang, tr?: Transfer, src?: PHC): Promise<Explanation> {
  const m = MED[a.medId];
  const alert = {
    type: a.kind === 'expiry' ? 'near-expiry lot' : 'projected stock-out', severity: a.severity,
    facility: p.name, block: p.block, district: p.district, state: p.state, medicine: m.name, unit: m.unit,
    stockOnHand: a.stock, avgDailyDemandP50: +a.avgDaily.toFixed(1), daysLeftP50: a.daysLeft, daysLeftHighDemandP90: a.daysLeftP90,
    emergencyDemandMultiplier: a.mult !== 1 ? a.mult : undefined,
    lot: a.batch, expiresInDays: a.expiryDays, unusableQty: a.wasteQty,
    suggestedTransfer: tr && src ? { from: `${src.name}, ${src.district}`, qty: tr.qty, distanceKm: tr.distanceKm } : undefined,
  };
  try {
    const r = await call('explain', { alert, lang });
    const j = JSON.parse(r.text);
    return { explanation: j.explanation, action: j.action, source: 'gemini' };
  } catch {
    return { ...templateExplain(a, p, lang, tr, src), source: 'fallback' };
  }
}

function templateExplain(a: Alert, p: PHC, lang: Lang, tr?: Transfer, src?: PHC) {
  const m = MED[a.medId], avg = Math.round(a.avgDaily);
  const need = Math.max(0, Math.round(a.avgDaily * 30 - a.stock));
  if (a.kind === 'expiry')
    return lang === 'hi'
      ? { explanation: `${m.name} का लॉट ${a.batch} ${a.expiryDays} दिन में एक्सपायर होगा, लेकिन रोज़ ~${avg} की खपत से ${a.wasteQty} यूनिट बच जाएँगी।`, action: 'इस लॉट को पहले दें (FEFO) और अतिरिक्त स्टॉक पास के कमी वाले पीएचसी को भेजें।' }
      : { explanation: `Lot ${a.batch} of ${m.name} expires in ${a.expiryDays} days, but at ~${avg}/day about ${a.wasteQty} units will be left unused.`, action: 'Issue this lot first (FEFO) and offer the excess to a nearby PHC that is running short.' };
  const expl = lang === 'hi'
    ? `रोज़ ~${avg} ${m.unit} की खपत पर ${a.stock} का स्टॉक ${a.daysLeft} दिन चलेगा (माँग ज़्यादा रही तो ${a.daysLeftP90} दिन)।`
    : `At ~${avg} ${m.unit}s a day, the ${a.stock} in stock will last ${a.daysLeft} days (${a.daysLeftP90} if demand runs high).`;
  const action = tr && src
    ? lang === 'hi' ? `${src.name} (${src.district}, ${tr.distanceKm} किमी) से ${tr.qty} यूनिट का ट्रांसफर माँगें।` : `Request the proposed transfer of ${tr.qty} from ${src.name}, ${src.district} (${tr.distanceKm} km).`
    : lang === 'hi' ? `आज ही कम से कम ${need} यूनिट का इंडेंट भेजें ताकि 30 दिन का स्टॉक रहे।` : `Raise an indent today for at least ${need} ${m.unit}s to cover 30 days.`;
  return { explanation: expl, action };
}

// ---------- Emergency scenario ----------
export type EventKind = 'dengue' | 'flood' | 'heatwave';
export interface Scenario { summary: string; durationDays: number; multipliers: { medicineId: string; multiplier: number; reason: string }[]; source: Source }

const PRESETS: Record<EventKind, [string, number, string][]> = {
  dengue: [['pcm', 2.6, 'Fever management is the mainstay of dengue care'], ['ors', 1.8, 'Oral rehydration for plasma leakage'], ['ns', 2.2, 'IV fluids for warning-sign cases'], ['rl', 2.2, 'IV fluids for warning-sign cases'], ['ibu', 0.6, 'NSAIDs avoided in dengue (bleeding risk)'], ['cet', 1.2, 'Symptomatic relief of rash/itch']],
  flood: [['ors', 2.5, 'Diarrhoeal outbreaks from contaminated water'], ['znc', 2.2, 'Zinc given with ORS for child diarrhoea'], ['mtz', 1.8, 'Amoebiasis/giardiasis after flooding'], ['cip', 1.6, 'Bacterial dysentery and typhoid'], ['ctx', 1.5, 'Respiratory and gut infections'], ['act', 1.8, 'Malaria rises with stagnant water'], ['clq', 1.6, 'Vivax malaria'], ['pvi', 1.8, 'Wound care'], ['amx', 1.4, 'Respiratory infections in camps'], ['abz', 1.3, 'Worm infestations']],
  heatwave: [['ors', 3.0, 'Dehydration from heat exposure'], ['ns', 2.0, 'IV rehydration for heat exhaustion/stroke'], ['rl', 2.0, 'IV rehydration for heat exhaustion/stroke'], ['pcm', 1.4, 'Fever and headache'], ['znc', 1.3, 'Diarrhoea from spoiled food']],
};

export async function generateScenario(event: EventKind, district: string, state: string): Promise<Scenario> {
  try {
    const r = await call('scenario', { event, district, state, medicines: MEDICINES.map(({ id, name }) => ({ id, name })) });
    const j = JSON.parse(r.text);
    const multipliers = (j.multipliers as Scenario['multipliers'])
      .filter((m) => MED[m.medicineId])
      .map((m) => ({ ...m, multiplier: Math.min(4, Math.max(0.3, +m.multiplier || 1)) })); // validate model output
    return { summary: j.summary, durationDays: j.durationDays, multipliers, source: 'gemini' };
  } catch {
    return {
      summary: `Preset ${event} surge profile for ${district} (Gemini unavailable).`, durationDays: 30, source: 'fallback',
      multipliers: PRESETS[event].map(([medicineId, multiplier, reason]) => ({ medicineId, multiplier, reason })),
    };
  }
}

// ---------- Ask SwasthChain (function calling) ----------
export type Row = Record<string, string | number>;
export interface ToolResult { tool: string; rows: Row[]; phcIds: string[]; transfers: Transfer[]; note?: string }
export interface AppData { phcs: PHC[]; lines: Record<string, Line>; alerts: Alert[]; transfers: Transfer[]; user: User }

const has = (a: string, b: unknown) => !b || a.toLowerCase().includes(String(b).toLowerCase().trim());
const findMed = (q: unknown) => MEDICINES.filter((m) => !q || m.id === String(q).toLowerCase() || has(m.name, q));

export function makeTools({ phcs, lines, alerts, transfers }: AppData) {
  const byId = Object.fromEntries(phcs.map((p) => [p.id, p]));
  const pick = (a: Record<string, unknown>) => phcs.filter((p) => has(p.state, a.state) && has(p.district, a.district));
  return {
    find_stockout_risks(a: Record<string, unknown>): ToolResult {
      const within = Number(a.withinDays) || 14, meds = findMed(a.medicine);
      const hits = pick(a).flatMap((p) => meds.map((m) => ({ p, m, l: lines[key(p.id, m.id)] }))).filter((x) => x.l.daysLeft <= within).sort((x, y) => x.l.daysLeft - y.l.daysLeft);
      return {
        tool: 'find_stockout_risks', transfers: [], phcIds: [...new Set(hits.map((h) => h.p.id))],
        rows: hits.map(({ p, m, l }) => ({ PHC: p.name, District: p.district, Medicine: m.name, Stock: l.stock, 'Days left': l.daysLeft, 'High-demand case': l.daysLeftP90 })),
      };
    },
    get_phc_status(a: Record<string, unknown>): ToolResult {
      const p = phcs.find((x) => has(x.name, a.phc) || has(x.name, `PHC ${a.phc}`));
      if (!p) return { tool: 'get_phc_status', rows: [], phcIds: [], transfers: [], note: `No PHC matching "${a.phc}" in your scope` };
      const rows = MEDICINES.map((m) => ({ m, l: lines[key(p.id, m.id)] })).sort((x, y) => x.l.daysLeft - y.l.daysLeft).slice(0, 10)
        .map(({ m, l }) => ({ Medicine: m.name, Stock: l.stock, 'Avg/day': Math.round(l.avgDaily), 'Days left': l.daysLeft }));
      const s = p.staff;
      return {
        tool: 'get_phc_status', rows, phcIds: [p.id], transfers: [],
        note: `${p.name}, ${p.block}, ${p.district}: beds ${p.beds - p.bedsOccupied}/${p.beds} free; MO ${s.mo.present}/${s.mo.sanctioned}, nurses ${s.nurse.present}/${s.nurse.sanctioned}, pharmacist ${s.pharmacist.present}/${s.pharmacist.sanctioned} present; OPD yesterday ${p.footfall.at(-1)}; ${alerts.filter((x) => x.phcId === p.id).length} alerts.`,
      };
    },
    suggest_transfers(a: Record<string, unknown>): ToolResult {
      const meds = new Set(findMed(a.medicine).map((m) => m.id));
      const ts = transfers.filter((t) => meds.has(t.medId) && byId[t.toId] && has(byId[t.toId].state, a.state));
      return {
        tool: 'suggest_transfers', transfers: ts, phcIds: [...new Set(ts.flatMap((t) => [t.fromId, t.toId]))],
        rows: ts.map((t) => ({ Medicine: MED[t.medId].name, From: `${byId[t.fromId]?.name ?? t.fromId}`, To: byId[t.toId].name, Qty: t.qty, Km: t.distanceKm, 'Shelf life (d)': t.shelfLifeDays, 'Cost ₹': t.cost })),
      };
    },
    district_summary(a: Record<string, unknown>): ToolResult {
      const ds = DISTRICTS.filter((d) => has(d.stateName, a.state)).map((d) => ({ d, ps: phcs.filter((p) => p.districtId === d.id) })).filter((x) => x.ps.length);
      const rows = ds.map(({ d, ps }) => {
        const s = summarise(ps, alerts);
        return { District: d.name, State: d.stateName, PHCs: s.phcs, Critical: s.critical, Warning: s.warning, Watch: s.watch, 'Beds free %': Math.round((100 * s.bedsFree) / s.beds), 'Staff present %': Math.round((100 * s.staffPresent) / s.staff) };
      }).sort((x, y) => y.Critical - x.Critical || y.Warning - x.Warning);
      return { tool: 'district_summary', rows, transfers: [], phcIds: ds.filter((x) => summarise(x.ps, alerts).critical > 0).flatMap((x) => x.ps.map((p) => p.id)) };
    },
  };
}

export interface AskResult { text: string; result?: ToolResult; source: Source; history: unknown[] }

export async function ask(question: string, history: unknown[], data: AppData): Promise<AskResult> {
  const tools = makeTools(data);
  const u = data.user;
  const context = `Data as of ${isoDay(AS_OF)}. User: ${u.title} (scope: ${u.phcId ?? u.districtId ?? u.stateId ?? 'all states'}); tools only return data in this scope.\n` +
    `States/districts: ${GEO.map((s) => `${s.name} (${s.districts.map((d) => d.name).join(', ')})`).join('; ')}.\nMedicines: ${MEDICINES.map((m) => m.name).join(', ')}.`;
  const contents: unknown[] = [...history, { role: 'user', parts: [{ text: question }] }];
  let last: ToolResult | undefined;
  try {
    for (let i = 0; i < 5; i++) {
      const r = await call('ask', { contents, context });
      if (r.content) contents.push(r.content);
      if (!r.functionCalls.length) return { text: r.text, result: last, source: 'gemini', history: contents };
      const parts = r.functionCalls.map((fc) => {
        const fn = tools[fc.name as keyof typeof tools];
        const res = fn ? fn(fc.args ?? {}) : { tool: fc.name, rows: [], phcIds: [], transfers: [], note: 'unknown tool' };
        if (res.rows.length || !last) last = res;
        return { functionResponse: { id: fc.id, name: fc.name, response: { count: res.rows.length, note: res.note, rows: res.rows.slice(0, 25) } } };
      });
      contents.push({ role: 'user', parts });
    }
    return { text: 'I needed too many steps for that; here is what I found.', result: last, source: 'gemini', history: contents };
  } catch {
    return { ...keywordAnswer(question, tools), source: 'fallback', history };
  }
}

// Offline: route the question to one tool by keywords.
function keywordAnswer(q: string, tools: ReturnType<typeof makeTools>) {
  const s = q.toLowerCase();
  const state = GEO.find((g) => s.includes(g.name.toLowerCase()))?.name;
  const district = DISTRICTS.find((d) => s.includes(d.name.toLowerCase()))?.name;
  const med = MEDICINES.find((m) => s.includes(m.id) || s.includes(m.name.split(' ')[0].toLowerCase()))?.name.split(' ')[0];
  const days = Number(s.match(/(\d+)\s*(day|din|दिन)/)?.[1]) || 14;
  const phc = s.match(/phc\s+([a-z .]+?)(\?|$| in | at )/)?.[1];
  const result = /transfer|redistribut|move/.test(s) ? tools.suggest_transfers({ medicine: med, state })
    : /district|compare|most/.test(s) ? tools.district_summary({ state })
    : phc ? tools.get_phc_status({ phc })
    : tools.find_stockout_risks({ state, district, medicine: med, withinDays: days });
  return { text: `Gemini is unavailable, so this is a direct data lookup (${result.tool}): ${result.rows.length} matching rows.${result.note ? ' ' + result.note : ''}`, result };
}
