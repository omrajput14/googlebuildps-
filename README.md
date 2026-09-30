# SwasthChain

Hackathon prototype of a federated AI platform for medicine supply across India's Primary Health Centres (PHCs). It covers 3 pilot states, 9 districts, 77 PHCs and 25 essential medicines, using 90 days of seeded dispensing data.

> Everything runs with **no keys at all**: mock data is generated in the browser, maps fall back to an SVG preview, and Gemini features fall back to deterministic templates (clearly labelled). Add keys to switch on the real Google services.

## Quick start

```bash
npm install
cp .env.example .env      # add GEMINI_API_KEY and, optionally, the Maps and Firebase keys
npm run dev               # http://localhost:5173 (the Gemini proxy runs inside the Vite dev server)
npm run check             # smoke test: seeded problems, optimiser, FedAvg convergence
```

Demo roles on the login screen:

| Role | Scope | Home screen focus |
|---|---|---|
| PHC Pharmacist | PHC Mocharim, Gaya | Today's update, my stock-outs, near-expiry lots |
| District Officer | Gaya | Transfers to approve, non-reporting PHCs, MO absence |
| State Officer | Bihar | District ranking, transfers, emergency scenarios, FL |
| National Analyst | All states | Aggregated state comparison, model performance |

**Seeded problems:** Gaya is short on ORS, zinc and paracetamol while neighbouring Patna has a surplus of all three. There are also single stock-outs in Nashik, Madurai, Muzaffarpur and Pune, plus a near-expiry amoxicillin lot (AMX-25C417) in Patna.

**Suggested demo path (State Officer):** Home → Alerts → *Explain with Gemini* (toggle हिंदी) → *Find transfer* → approve with a reason (the alert disappears and the decision appears in the audit trail) → Emergency: Flood + Muzaffarpur → Apply → Federated: *Run 10 rounds*, then raise DP noise → Ask: "Which PHCs in Bihar will run out of ORS in 10 days?" → sign in as Pharmacist → Daily update → *Simulate offline* → submit → untick → it syncs.

## Google products used

| Product | Where |
|---|---|
| **Gemini API** (`gemini-2.5-flash`, override with `GEMINI_MODEL`) | Alert explanations (structured JSON, English/Hindi), emergency demand multipliers (JSON schema with a medicine-id enum), and Ask SwasthChain (function calling over 4 app tools). The key stays server-side in `server/gemini.mjs`. |
| **Google Maps JavaScript API** | Stock-out risk heatmap (Data-layer symbols sized and coloured by risk), PHC markers, and transfer polylines. Set `VITE_GOOGLE_MAPS_API_KEY`. |
| **Firebase Authentication** | Email/password demo accounts; the role comes from custom claims set by the seed script. |
| **Cloud Firestore** | `phcs` (one document per facility), `updates` (PHC daily reports), and `audit` (append-only). Access rules are in `firestore.rules`. |
| **Cloud Run** | A single container serves the SPA and the Gemini proxy. |

## Firebase (optional)

1. Create a Firebase project, enable **Email/Password** auth and **Firestore**.
2. Put the web config in `.env` (`VITE_FIREBASE_*`) and choose a `VITE_DEMO_PASSWORD` / `DEMO_PASSWORD` (same value).
3. Seed the data and demo users:
   ```bash
   gcloud auth application-default login
   npm run seed
   ```
4. Deploy the rules: `firebase deploy --only firestore:rules`

If `VITE_FIREBASE_API_KEY` is empty, the app uses local state. All reads and writes go through `src/data/store.ts`, so you can swap the backend there.

## Deploy to Cloud Run

VITE_* values are compiled into the bundle, so put them in `.env.production` before you build. The Gemini key is a runtime secret.

```bash
printf "GEMINI_API_KEY=YOUR_KEY" | gcloud secrets create gemini-api-key --data-file=-
gcloud run deploy swasthchain --source . --region asia-south1 --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

Restrict the Maps key by HTTP referrer to the Cloud Run URL.

## Code map

```
server/gemini.mjs     Gemini proxy: prompts, JSON schemas and tool declarations (server-side only)
server/index.mjs      Production server (static + /api/gemini)
src/data/generate.ts  Deterministic mock data (states, PHCs, medicines, history, seeded problems)
src/data/engine.ts    Forecast (P10/P50/P90), days-of-stock, alerts, redistribution optimiser
src/data/fed.ts       Federated learning simulation (local GD, clipping, DP noise, secure aggregation, FedAvg)
src/data/store.ts     Data layer: Firebase Auth/Firestore or local; audit trail; offline queue
src/gemini.ts         Client for Gemini tasks, function-call loop, offline fallbacks
src/pages/*           One file per screen
public/sw.js          App-shell cache so the PHC form opens offline (production build)
```

## Architecture: prototype → production

| Concern | Prototype | Production design |
|---|---|---|
| State data | Seeded in browser / one Firestore project | **One node per state**: Firestore or **Cloud SQL** in the state's own GCP project and region, fed from the state's HMIS/eAushadhi. Raw data never leaves it. |
| Forecast model | Weekday-seasonal + damped trend in `engine.ts` | **Vertex AI** custom training job inside each state project (e.g. a global LightGBM/TFT quantile model). Only weight updates are sent to a national aggregator (Vertex AI Pipelines running FedAvg with secure aggregation and DP-SGD). Models are served per state from Vertex AI endpoints. |
| FL demo | In-browser simulation (`fed.ts`), clearly labelled | Same protocol with real crypto (for example Flower or TFF on Vertex AI), attested aggregator, and a privacy budget (ε) tracked per round. |
| Analytics | Client-side aggregation | Each state publishes aggregated, de-identified tables to **BigQuery** (Analytics Hub listings). National dashboards query only those tables. |
| Alerts & explanations | Computed in the browser; Gemini via proxy | A Cloud Run job computes alerts nightly. Gemini on Vertex AI generates explanations; delivery is by push, SMS or WhatsApp. |
| Redistribution | Greedy matcher | Min-cost-flow / LP with OR-Tools on Cloud Run. Adds vehicle routing, cold chain and FEFO constraints. |
| Offline capture | localStorage queue + service worker | Android app with Firestore offline persistence and background sync; SMS fallback. |
| Privacy | Facility aggregates only; no patient data | Same principle, plus DPDP Act 2023 controls: purpose limitation, per-state keys (CMEK), VPC-SC and audit logs. |

Known simplifications: approved transfers and synced updates live in memory and reset on reload, while the audit log persists in localStorage or Firestore. National users cannot drill below district level.
