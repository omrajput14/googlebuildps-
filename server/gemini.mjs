// Gemini proxy: the API key and all prompts/schemas live server-side. The browser only picks a task
// and sends data. Used as Vite dev middleware and by the production Express server.
import { GoogleGenAI, Type } from '@google/genai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
let ai;
const client = () => (ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const S = { type: Type.STRING };

const ASK_TOOLS = [
  {
    name: 'find_stockout_risks',
    description: 'List PHC + medicine pairs projected to run out of stock within N days (P50 forecast). Use for "which PHCs will run out of X".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        state: { type: Type.STRING, description: 'State name, e.g. Bihar' },
        district: { type: Type.STRING, description: 'District name, e.g. Gaya' },
        medicine: { type: Type.STRING, description: 'Medicine name or part of it, e.g. ORS' },
        withinDays: { type: Type.INTEGER, description: 'Horizon in days, default 14' },
      },
    },
  },
  {
    name: 'get_phc_status',
    description: 'Stock, beds, staff attendance and alerts for one PHC by (partial) name.',
    parameters: { type: Type.OBJECT, properties: { phc: { type: Type.STRING } }, required: ['phc'] },
  },
  {
    name: 'suggest_transfers',
    description: 'Proposed cross-district redistribution transfers from the optimiser.',
    parameters: { type: Type.OBJECT, properties: { medicine: S, state: S } },
  },
  {
    name: 'district_summary',
    description: 'Per-district counts of critical/warning/watch alerts, bed availability and staff attendance.',
    parameters: { type: Type.OBJECT, properties: { state: S } },
  },
];

const TASKS = {
  explain: ({ alert, lang }) => ({
    contents: `Alert (JSON): ${JSON.stringify(alert)}`,
    config: {
      systemInstruction:
        `You explain medicine supply alerts to busy staff in Indian Primary Health Centres. ` +
        `Write in ${lang === 'hi' ? 'simple Hindi (Devanagari script); medicine names may stay in English' : 'plain English'}. ` +
        `"explanation": exactly ONE short sentence saying what will happen, when, and why, using the numbers given. ` +
        `"action": ONE concrete next step (raise an indent, request the suggested transfer, issue FEFO, etc.). No jargon.`,
      responseMimeType: 'application/json',
      responseSchema: { type: Type.OBJECT, properties: { explanation: S, action: S }, required: ['explanation', 'action'] },
    },
  }),
  scenario: ({ event, district, state, medicines }) => ({
    contents: `Event: ${event}. Location: ${district} district, ${state}, India.\nMedicines (id: name):\n${medicines.map((m) => `${m.id}: ${m.name}`).join('\n')}`,
    config: {
      systemInstruction:
        'You are a public-health supply planner for Indian PHCs. For the declared event, estimate 30-day demand multipliers ' +
        '(1.0 = unchanged, max 4.0) for the 5-12 most affected medicines, each with a one-line clinical reason. ' +
        'Reflect typical patterns, e.g. dengue: paracetamol, ORS, IV fluids; floods: ORS, zinc, antibiotics, antimalarials; heatwave: ORS, IV fluids.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: S,
          durationDays: { type: Type.INTEGER },
          multipliers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { medicineId: { type: Type.STRING, enum: medicines.map((m) => m.id) }, multiplier: { type: Type.NUMBER }, reason: S },
              required: ['medicineId', 'multiplier', 'reason'],
            },
          },
        },
        required: ['summary', 'durationDays', 'multipliers'],
      },
    },
  }),
  ask: ({ contents, context }) => ({
    contents,
    config: {
      systemInstruction:
        'You are "Ask SwasthChain", an assistant for Indian public-health supply officers. Always answer from the tools, never invent numbers. ' +
        'Call tools as needed, then answer in 1-3 short sentences (same language as the question) naming the key PHCs/medicines. ' +
        'A table and map of the tool results are shown next to your answer, so do not repeat every row.\n' + String(context).slice(0, 4000),
      tools: [{ functionDeclarations: ASK_TOOLS }],
    },
  }),
};

export async function geminiMiddleware(req, res) {
  const send = (code, body) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') return send(405, { error: 'POST only' });
  if (!process.env.GEMINI_API_KEY) return send(503, { error: 'GEMINI_API_KEY is not set on the server' });
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 300_000) return send(413, { error: 'Request too large' });
    }
    const { task, payload } = JSON.parse(raw);
    if (!Object.hasOwn(TASKS, task)) return send(400, { error: 'Unknown task' });
    const r = await client().models.generateContent({ model: MODEL, ...TASKS[task](payload) });
    const content = r.candidates?.[0]?.content ?? null;
    const text = content?.parts?.filter((p) => p.text && !p.thought).map((p) => p.text).join('') ?? '';
    send(200, { text, functionCalls: r.functionCalls ?? [], content, model: MODEL });
  } catch (e) {
    send(502, { error: String(e?.message ?? e) });
  }
}
