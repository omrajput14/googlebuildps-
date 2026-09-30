// Seeds Firestore with the mock PHC network and creates the 4 demo users with role custom claims.
// Auth: `gcloud auth application-default login` (or GOOGLE_APPLICATION_CREDENTIALS=service-account.json)
// Run:  FIREBASE_PROJECT_ID=my-project DEMO_PASSWORD=... npm run seed
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { DEMO_USERS, MEDICINES, generatePhcs, type Role } from '../src/data/generate';

const projectId = process.env.FIREBASE_PROJECT_ID;
const password = process.env.DEMO_PASSWORD;
if (!projectId || !password || password.length < 8) {
  console.error('Set FIREBASE_PROJECT_ID and DEMO_PASSWORD (8+ chars).');
  process.exit(1);
}

const app = initializeApp({ projectId, credential: applicationDefault() });
const databaseId = process.env.FIRESTORE_DATABASE_ID;
const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
const auth = getAuth(app);

const phcs = generatePhcs();
const batch = db.batch();
for (const p of phcs) batch.set(db.doc(`phcs/${p.id}`), p); // one doc per PHC (~20 KB: stock + 90-day history)
for (const m of MEDICINES) batch.set(db.doc(`medicines/${m.id}`), m);
await batch.commit();
console.log(`Wrote ${phcs.length} PHCs and ${MEDICINES.length} medicines`);

for (const role of Object.keys(DEMO_USERS) as Role[]) {
  const email = `${role}@swasthchain.demo`;
  const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email, password, displayName: DEMO_USERS[role].name }));
  await auth.updateUser(user.uid, { password });
  await auth.setCustomUserClaims(user.uid, { role });
  console.log(`User ${email} -> role ${role}`);
}
