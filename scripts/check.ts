// Smoke check for data + engine + FL sim: `npm run check`
import assert from 'node:assert/strict';
import { generatePhcs, MEDICINES, GEO } from '../src/data/generate';
import { analyse, alertsFrom, proposeTransfers } from '../src/data/engine';
import { buildNodes, fedRound, wape } from '../src/data/fed';

const phcs = generatePhcs();
assert.equal(GEO.length, 3);
assert.equal(MEDICINES.length, 25);
assert.ok(phcs.length >= 72 && phcs.length <= 90, `phcs=${phcs.length}`);
assert.deepEqual(generatePhcs()[5].stock.ors.history, phcs[5].stock.ors.history, 'deterministic');

const lines = analyse(phcs);
const alerts = alertsFrom(phcs, lines);
const gayaOrs = alerts.filter((a) => a.phcId.startsWith('BR-GAY') && a.medId === 'ors' && a.kind === 'stockout');
assert.ok(gayaOrs.filter((a) => a.severity === 'critical').length >= 2, 'Gaya ORS critical');
assert.ok(alerts.some((a) => a.kind === 'expiry' && a.phcId === 'BR-PAT-01'), 'Patna near-expiry lot');
const sev = (s: string) => alerts.filter((a) => a.severity === s).length;
console.log('alerts', { critical: sev('critical'), warning: sev('warning'), watch: sev('watch') });

const tr = proposeTransfers(phcs, lines);
assert.ok(tr.some((t) => t.fromId.startsWith('BR-PAT') && t.toId.startsWith('BR-GAY') && t.medId === 'ors'), 'Patna -> Gaya ORS');
assert.ok(tr.every((t) => t.dstAfter > t.dstBefore && t.qty > 0));
console.log('transfers', tr.length, tr.slice(0, 3).map((t) => `${t.medId} ${t.fromId}->${t.toId} ${t.qty} ${t.distanceKm}km`));

const nodes = buildNodes(phcs);
let w = [0, 0, 0, 0];
const e0 = wape(w, nodes[0].test);
for (let r = 0; r < 25; r++) w = fedRound(w, nodes, { sigma: 0, clip: 1, secure: true }).next;
const e15 = wape(w, nodes[0].test);
assert.ok(e15 < e0 * 0.5, `FedAvg improves: ${e0.toFixed(1)} -> ${e15.toFixed(1)}`);
console.log('fed WAPE', e0.toFixed(1), '->', e15.toFixed(1), 'w', w.map((x) => x.toFixed(2)));
console.log('OK');
