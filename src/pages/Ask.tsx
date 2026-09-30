import { useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send, Sparkles, Table2 } from 'lucide-react';
import { useApp } from '../App';
import { MED } from '../data/generate';
import { riskScore } from '../data/engine';
import { ask, type Row, type Source, type ToolResult } from '../gemini';
import MapView from '../MapView';
import { Card, PageHead, SourceTag } from '../ui';

interface Msg { role: 'user' | 'assistant'; text: string; source?: Source; result?: ToolResult }

const SUGGEST: Record<string, string[]> = {
  pharmacist: ['Which medicines at my PHC will run out in 14 days?', 'What is the status of PHC Mocharim?', 'मेरे पीएचसी में ORS कितने दिन चलेगा?'],
  default: ['Which PHCs in Bihar will run out of ORS in 10 days?', 'Which districts have the most critical alerts?', 'Suggest transfers for zinc in Bihar', 'What is the status of PHC Mocharim?'],
};

export default function Ask() {
  const { user, scoped, lines, alerts, transfers, byId, t } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const ids = useMemo(() => new Set(scoped.map((p) => p.id)), [scoped]);
  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setQ(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text }]);
    const data = { phcs: scoped, lines, user, alerts: alerts.filter((a) => ids.has(a.phcId)), transfers: transfers.filter((x) => ids.has(x.toId)) };
    const r = await ask(text, history, data);
    setHistory(r.history.slice(-20));
    setMsgs((m) => [...m, { role: 'assistant', text: r.text, source: r.source, result: r.result }]);
    setShown(null); setBusy(false);
    setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  const withResult = msgs.map((m, i) => ({ m, i })).filter((x) => x.m.result);
  const result = (shown != null ? msgs[shown]?.result : withResult.at(-1)?.m.result);
  const hl = new Set(result?.phcIds ?? []);
  const points = useMemo(() => scoped.filter((p) => !result || hl.has(p.id) || !hl.size).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, risk: riskScore(p.id, alerts), label: `${p.name}, ${p.district}`, highlight: hl.has(p.id) })), [scoped, result, alerts]); // eslint-disable-line react-hooks/exhaustive-deps
  const mapLines = useMemo(() => (result?.transfers ?? []).filter((x) => byId[x.fromId]).map((x) => ({ id: x.id, from: byId[x.fromId], to: byId[x.toId], label: `${x.qty} × ${MED[x.medId].name}` })), [result, byId]);

  return (
    <>
      <PageHead title={t('Ask SwasthChain')} sub="Natural-language questions answered by Gemini using function calls against live app data (scoped to your role)" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="flex flex-col lg:col-span-2" title="Conversation" icon={MessageSquare}>
          <div className="max-h-[55vh] min-h-64 flex-1 space-y-3 overflow-y-auto pr-1">
            {!msgs.length && (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">Try one of these:</p>
                {(SUGGEST[user.role] ?? SUGGEST.default).map((s) => <button key={s} onClick={() => send(s)} className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:border-teal-400 hover:bg-teal-50/40">{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm ${m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.role === 'assistant' && (
                    <div className="mt-1.5 flex items-center gap-3">
                      {m.source && <SourceTag source={m.source} />}
                      {m.result && <button className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline" onClick={() => setShown(i)}><Table2 size={12} />{m.result.rows.length} rows</button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-violet-700"><Loader2 size={15} className="animate-spin" /><Sparkles size={14} /> Gemini is querying the data…</div>}
            <div ref={end} />
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(q); }}>
            <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Ask a question about stock, alerts or transfers')} aria-label="Question" />
            <button className="btn btn-primary" disabled={busy || !q.trim()} aria-label="Send"><Send size={16} /></button>
          </form>
        </Card>

        <div className="space-y-5 lg:col-span-3">
          <Card title={result ? `Matching data · ${result.tool}` : 'Matching data'} icon={Table2}>
            {result?.note && <p className="mb-2 text-sm text-slate-600">{result.note}</p>}
            {result?.rows.length ? <ResultTable rows={result.rows} /> : <p className="text-sm text-slate-500">{result ? 'No matching rows.' : 'Results of the functions Gemini calls appear here.'}</p>}
          </Card>
          <Card title="On the map">
            <MapView points={points} lines={mapLines} height={320} />
          </Card>
        </div>
      </div>
    </>
  );
}

function ResultTable({ rows }: { rows: Row[] }) {
  const cols = Object.keys(rows[0]);
  return (
    <div className="-mx-4 max-h-96 overflow-auto md:-mx-5">
      <table className="tbl">
        <thead className="sticky top-0 bg-white"><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c} className={typeof r[c] === 'number' ? 'tabular-nums' : ''}>{c === 'Days left' && +r[c] <= 7 ? <b className="text-red-700">{r[c]}</b> : r[c]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
