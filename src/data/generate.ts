// Deterministic mock data: same seed -> same PHCs everywhere (browser, seed script, checks).
// No patient-level data: only facility aggregates (stock, dispensing counts, OPD counts, beds, staff).

export const AS_OF = new Date('2026-09-30T00:00:00');
export const DAYS = 90;
const DAY = 864e5;
export const dateOf = (i: number) => new Date(AS_OF.getTime() - (DAYS - 1 - i) * DAY); // i >= DAYS = future
export const weekday = (i: number) => dateOf(i).getDay();
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const daysUntil = (iso: string) => Math.round((new Date(iso + 'T00:00:00').getTime() - AS_OF.getTime()) / DAY);

export type Role = 'pharmacist' | 'district' | 'state' | 'national';
export interface User { role: Role; name: string; title: string; phcId?: string; districtId?: string; stateId?: string }
export const DEMO_USERS: Record<Role, User> = {
  pharmacist: { role: 'pharmacist', name: 'Sunita Kumari', title: 'PHC Pharmacist', phcId: 'BR-GAY-01', districtId: 'GAY', stateId: 'BR' },
  district: { role: 'district', name: 'Dr. Arvind Prasad', title: 'District Officer', districtId: 'GAY', stateId: 'BR' },
  state: { role: 'state', name: 'Meera Sinha, IAS', title: 'State Officer', stateId: 'BR' },
  national: { role: 'national', name: 'Dr. Kavya Iyer', title: 'National Analyst' },
};

export interface Medicine { id: string; name: string; unit: string; daily: number; cost: number; season: number }
// daily = typical units/day at an average PHC; cost = ₹/unit; season = monsoon sensitivity
export const MEDICINES: Medicine[] = [
  { id: 'pcm', name: 'Paracetamol 500 mg', unit: 'tab', daily: 140, cost: 0.35, season: 0.5 },
  { id: 'ors', name: 'ORS sachet', unit: 'sachet', daily: 30, cost: 3.5, season: 0.9 },
  { id: 'amx', name: 'Amoxicillin 500 mg', unit: 'cap', daily: 60, cost: 2.2, season: 0.3 },
  { id: 'znc', name: 'Zinc 20 mg', unit: 'tab', daily: 25, cost: 0.9, season: 0.8 },
  { id: 'ifa', name: 'Iron-Folic Acid', unit: 'tab', daily: 90, cost: 0.25, season: 0 },
  { id: 'met', name: 'Metformin 500 mg', unit: 'tab', daily: 70, cost: 0.6, season: 0 },
  { id: 'aml', name: 'Amlodipine 5 mg', unit: 'tab', daily: 45, cost: 0.4, season: 0 },
  { id: 'ctx', name: 'Cotrimoxazole 480 mg', unit: 'tab', daily: 40, cost: 0.8, season: 0.3 },
  { id: 'mtz', name: 'Metronidazole 400 mg', unit: 'tab', daily: 45, cost: 0.7, season: 0.5 },
  { id: 'abz', name: 'Albendazole 400 mg', unit: 'tab', daily: 12, cost: 1.5, season: 0.1 },
  { id: 'cet', name: 'Cetirizine 10 mg', unit: 'tab', daily: 35, cost: 0.3, season: 0.2 },
  { id: 'ibu', name: 'Ibuprofen 400 mg', unit: 'tab', daily: 50, cost: 0.5, season: 0.1 },
  { id: 'azi', name: 'Azithromycin 500 mg', unit: 'tab', daily: 15, cost: 6, season: 0.3 },
  { id: 'cip', name: 'Ciprofloxacin 500 mg', unit: 'tab', daily: 30, cost: 1.8, season: 0.4 },
  { id: 'ome', name: 'Omeprazole 20 mg', unit: 'cap', daily: 40, cost: 0.6, season: 0 },
  { id: 'sal', name: 'Salbutamol 4 mg', unit: 'tab', daily: 20, cost: 0.3, season: 0.1 },
  { id: 'act', name: 'Artemether-Lumefantrine (ACT)', unit: 'course', daily: 4, cost: 45, season: 1.2 },
  { id: 'clq', name: 'Chloroquine 250 mg', unit: 'tab', daily: 10, cost: 0.8, season: 1.0 },
  { id: 'oxy', name: 'Oxytocin 10 IU inj.', unit: 'amp', daily: 3, cost: 12, season: 0 },
  { id: 'cal', name: 'Calcium 500 mg', unit: 'tab', daily: 60, cost: 0.4, season: 0 },
  { id: 'vta', name: 'Vitamin A syrup', unit: 'bottle', daily: 3, cost: 40, season: 0 },
  { id: 'rl', name: 'Ringer Lactate 500 ml', unit: 'bottle', daily: 6, cost: 28, season: 0.9 },
  { id: 'ns', name: 'Normal Saline 500 ml', unit: 'bottle', daily: 8, cost: 22, season: 0.9 },
  { id: 'dcy', name: 'Dicyclomine 10 mg', unit: 'tab', daily: 20, cost: 0.4, season: 0.3 },
  { id: 'pvi', name: 'Povidone-Iodine 5%', unit: 'bottle', daily: 2, cost: 35, season: 0.1 },
];
export const MED = Object.fromEntries(MEDICINES.map((m) => [m.id, m])) as Record<string, Medicine>;

interface DistrictGeo { id: string; name: string; lat: number; lng: number; blocks: string[]; villages: string[] }
interface StateGeo { id: string; name: string; peak: number; districts: DistrictGeo[] }
// peak = day index of monsoon demand peak (TN's north-east monsoon arrives later)
export const GEO: StateGeo[] = [
  { id: 'MH', name: 'Maharashtra', peak: 40, districts: [
    { id: 'PUN', name: 'Pune', lat: 18.52, lng: 73.86, blocks: ['Haveli', 'Mulshi', 'Baramati'], villages: ['Wagholi', 'Lonikand', 'Uruli Kanchan', 'Paud', 'Pirangut', 'Kolwan', 'Supe', 'Morgaon', 'Vadgaon Nimbalkar'] },
    { id: 'NSK', name: 'Nashik', lat: 20.0, lng: 73.79, blocks: ['Niphad', 'Sinnar', 'Igatpuri'], villages: ['Ozar', 'Pimpalgaon Baswant', 'Lasalgaon', 'Wavi', 'Dodhi', 'Nandur Shingote', 'Ghoti', 'Wadivarhe'] },
    { id: 'NGP', name: 'Nagpur', lat: 21.15, lng: 79.09, blocks: ['Kamptee', 'Hingna', 'Katol'], villages: ['Kodamendhi', 'Mahadula', 'Wanadongri', 'Takalghat', 'Nildoh', 'Kondhali', 'Metpanjra', 'Yenwa', 'Ridhora'] },
  ] },
  { id: 'BR', name: 'Bihar', peak: 50, districts: [
    { id: 'PAT', name: 'Patna', lat: 25.59, lng: 85.14, blocks: ['Phulwari', 'Danapur', 'Masaurhi'], villages: ['Sampatchak', 'Parsa Bazar', 'Khagaul', 'Shahpur', 'Maner', 'Nadwan', 'Dhanarua', 'Punpun', 'Beldarichak'] },
    { id: 'GAY', name: 'Gaya', lat: 24.79, lng: 85.0, blocks: ['Bodh Gaya', 'Sherghati', 'Tekari'], villages: ['Mocharim', 'Bakraur', 'Dobhi', 'Amas', 'Gurua', 'Konch', 'Paraiya', 'Belaganj', 'Khizarsarai'] },
    { id: 'MUZ', name: 'Muzaffarpur', lat: 26.12, lng: 85.39, blocks: ['Kanti', 'Musahari', 'Sakra'], villages: ['Kanti Bazar', 'Damodarpur', 'Budhnagra', 'Sakra Waji', 'Dholi', 'Madhaul', 'Turki', 'Bochahan'] },
  ] },
  { id: 'TN', name: 'Tamil Nadu', peak: 85, districts: [
    { id: 'TVL', name: 'Tiruvallur', lat: 13.14, lng: 79.91, blocks: ['Poonamallee', 'Gummidipoondi', 'Tiruttani'], villages: ['Thiruverkadu', 'Nemam', 'Kavaraipettai', 'Elavur', 'Pallipattu', 'R.K. Pet', 'Pondavakkam', 'Vellavedu'] },
    { id: 'MDU', name: 'Madurai', lat: 9.93, lng: 78.12, blocks: ['Melur', 'Thirumangalam', 'Vadipatti'], villages: ['Kottampatti', 'Keelavalavu', 'Kallikudi', 'T. Kallupatti', 'Sholavandan', 'Alanganallur', 'Peraiyur', 'Chellampatti', 'Thiruvathavur'] },
    { id: 'CBE', name: 'Coimbatore', lat: 11.02, lng: 76.96, blocks: ['Pollachi', 'Mettupalayam', 'Sulur'], villages: ['Kinathukadavu', 'Negamam', 'Karamadai', 'Sirumugai', 'Annur', 'Karumathampatti', 'Sultanpet', 'Kottur'] },
  ] },
];
export const DISTRICTS = GEO.flatMap((s) => s.districts.map((d) => ({ ...d, stateId: s.id, stateName: s.name })));

export interface Batch { batch: string; expiry: string; qty: number }
export interface StockLine { stock: number; batches: Batch[]; history: number[] }
export interface Staff { present: number; sanctioned: number }
export interface PHC {
  id: string; name: string; stateId: string; state: string; districtId: string; district: string; block: string;
  lat: number; lng: number; population: number; beds: number; bedsOccupied: number;
  staff: { mo: Staff; nurse: Staff; pharmacist: Staff }; attendance30: number; lastReportDays: number;
  footfall: number[]; stock: Record<string, StockLine>;
}

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deliberate demo problems (days of stock cover at as-of date). k = PHC index within district.
function seededCover(districtId: string, k: number, medId: string): number | undefined {
  if (districtId === 'GAY') {
    if (medId === 'ors') return [4, 6, 9, 11, 13, 16, 19, 12, 24][k]; // deficit district
    if (medId === 'znc') return [7, 10, 13, 17, 22, 12, 26, 15, 20][k];
    if (medId === 'pcm') return [11, 16, 25, 14, 28, 19, 30, 22, 13][k];
    if (medId === 'amx' && k === 0) return 7;
  }
  if (districtId === 'PAT' && ['ors', 'znc', 'pcm'].includes(medId)) return 100 + k * 5; // surplus neighbour
  if (districtId === 'NSK' && medId === 'pcm' && k < 2) return [5, 11][k];
  if (districtId === 'MDU' && medId === 'amx' && k === 0) return 6;
  if (districtId === 'MUZ' && medId === 'act' && k === 1) return 8;
  if (districtId === 'PUN' && medId === 'met' && k === 2) return 12;
}

const DOW = [0.45, 1.2, 1.1, 1.05, 1.0, 1.0, 0.95]; // Sun..Sat OPD pattern
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

export function generatePhcs(): PHC[] {
  const rnd = mulberry32(20260930);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const addDays = (n: number) => isoDay(new Date(AS_OF.getTime() + n * DAY));
  const out: PHC[] = [];
  for (const s of GEO) {
    const seasonal = (i: number, amp: number) => 1 + amp * 0.6 * Math.exp(-(((i - s.peak) / 22) ** 2));
    for (const d of s.districts) {
      d.villages.forEach((v, k) => {
        const scale = 0.6 + rnd() * 0.8;
        const is24x7 = rnd() < 0.4;
        const beds = is24x7 ? 10 : 6;
        const stock: Record<string, StockLine> = {};
        for (const m of MEDICINES) {
          const history = Array.from({ length: DAYS }, (_, i) =>
            Math.max(0, Math.round(m.daily * scale * DOW[weekday(i)] * seasonal(i, m.season) * (1 + 0.2 * gauss()))));
          const cover = seededCover(d.id, k, m.id) ?? (rnd() < 0.03 ? 16 + rnd() * 6 : 28 + rnd() * 50);
          let qty = Math.max(0, Math.round(mean(history.slice(-14)) * cover));
          const batches: Batch[] = [];
          const nb = 1 + Math.floor(rnd() * 3);
          for (let b = 0; b < nb; b++) {
            const q = b === nb - 1 ? qty : Math.round(qty * (0.3 + rnd() * 0.3));
            qty -= q;
            batches.push({ batch: `${m.id.toUpperCase()}-${25 + Math.floor(rnd() * 2)}${'ABCDEFGH'[Math.floor(rnd() * 8)]}${100 + Math.floor(rnd() * 900)}`, expiry: addDays(80 + Math.floor(rnd() * 600)), qty: q });
          }
          if (d.id === 'PAT' && k === 0 && m.id === 'amx') // near-expiry lot: far more than can be used in time
            batches.push({ batch: 'AMX-25C417', expiry: addDays(18), qty: Math.round(mean(history.slice(-14)) * 55) });
          batches.sort((a, b) => a.expiry.localeCompare(b.expiry));
          stock[m.id] = { stock: batches.reduce((t, b) => t + b.qty, 0), batches, history };
        }
        const present = (n: number) => Array.from({ length: n }, () => rnd() < 0.82).filter(Boolean).length;
        const mo = is24x7 ? 2 : 1, nurse = is24x7 ? 4 : 3;
        out.push({
          id: `${s.id}-${d.id}-${String(k + 1).padStart(2, '0')}`,
          name: `PHC ${v}`, stateId: s.id, state: s.name, districtId: d.id, district: d.name, block: d.blocks[k % d.blocks.length],
          lat: +(d.lat + (rnd() - 0.5) * 0.6).toFixed(4), lng: +(d.lng + (rnd() - 0.5) * 0.6).toFixed(4),
          population: Math.round(scale * 30000), beds, bedsOccupied: Math.floor(beds * (0.3 + rnd() * 0.65)),
          staff: { mo: { present: present(mo), sanctioned: mo }, nurse: { present: present(nurse), sanctioned: nurse }, pharmacist: { present: present(1), sanctioned: 1 } },
          attendance30: +(0.7 + rnd() * 0.28).toFixed(2),
          lastReportDays: d.id === 'GAY' && k === 0 ? 1 : rnd() < 0.12 ? 1 + Math.floor(rnd() * 4) : 0,
          footfall: Array.from({ length: DAYS }, (_, i) => Math.round(scale * 95 * DOW[weekday(i)] * seasonal(i, 0.4) * (1 + 0.12 * gauss()))),
          stock,
        });
      });
    }
  }
  return out;
}
