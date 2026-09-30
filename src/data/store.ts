// Data layer. Firebase (Auth + Firestore) when VITE_FIREBASE_* is set, otherwise local mock data.
// The rest of the app only calls these functions, so either backend can be swapped in.
import { DEMO_USERS, generatePhcs, type PHC, type Role, type User } from './generate';

const env = import.meta.env;
const fbConfig = env.VITE_FIREBASE_API_KEY
  ? { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID }
  : null;
export const backend: 'firebase' | 'local' = fbConfig ? 'firebase' : 'local';

let fbp: ReturnType<typeof loadFirebase> | undefined;
async function loadFirebase() {
  const [{ initializeApp }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp(fbConfig!);
  return { auth, fs, a: auth.getAuth(app), db: fs.getFirestore(app) };
}
const fb = () => (fbp ??= loadFirebase());

export async function signIn(role: Role): Promise<User> {
  if (!fbConfig) return DEMO_USERS[role];
  const { auth, a } = await fb();
  const cred = await auth.signInWithEmailAndPassword(a, `${role}@swasthchain.demo`, env.VITE_DEMO_PASSWORD);
  const claimed = (await cred.user.getIdTokenResult()).claims.role as Role | undefined; // set by `npm run seed`
  if (!claimed || !DEMO_USERS[claimed]) throw new Error('Account has no role claim — run npm run seed');
  return DEMO_USERS[claimed];
}

export async function signOut() {
  if (fbConfig) await (await fb()).auth.signOut((await fb()).a);
}

export async function loadPhcs(): Promise<PHC[]> {
  if (!fbConfig) return generatePhcs();
  try {
    const { fs, db } = await fb();
    const snap = await fs.getDocs(fs.collection(db, 'phcs'));
    if (!snap.empty) return snap.docs.map((d) => d.data() as PHC);
  } catch (e) {
    console.warn('Firestore unavailable, using local mock data', e);
  }
  return generatePhcs();
}

// ---- Audit trail (append-only) ----
export interface AuditEntry { at: string; by: string; role: Role; action: string; detail: string; reason: string }
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full/blocked: in-memory only */ } };

export const loadAudit = () => read<AuditEntry[]>('sc_audit', []);
export async function addAudit(e: AuditEntry) {
  write('sc_audit', [e, ...loadAudit()]);
  if (fbConfig) { const { fs, db } = await fb(); await fs.addDoc(fs.collection(db, 'audit'), e); }
}

// ---- Offline queue for PHC daily updates ----
export interface DailyUpdate {
  id: string; phcId: string; date: string; opd: number; bedsOccupied: number;
  present: { mo: number; nurse: number; pharmacist: number }; issued: Record<string, number>;
  createdAt: string; synced: boolean;
}
export const loadQueue = () => read<DailyUpdate[]>('sc_queue', []);
export const saveQueue = (q: DailyUpdate[]) => write('sc_queue', q);

/** Push pending updates; returns the ones that reached the backend. */
export async function syncPending(q: DailyUpdate[]): Promise<DailyUpdate[]> {
  const pending = q.filter((u) => !u.synced);
  if (!pending.length) return [];
  if (fbConfig) {
    const { fs, db } = await fb();
    for (const u of pending) await fs.setDoc(fs.doc(db, 'updates', u.id), { ...u, synced: true });
  } else {
    await new Promise((r) => setTimeout(r, 700)); // local backend: simulate network latency
  }
  return pending;
}
