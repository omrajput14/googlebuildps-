// Google Maps (JS API, Data layer symbols as a risk heatmap + polylines for transfers).
// Falls back to an SVG projection when no key is set or the key/network fails, so the demo always renders.
import { useEffect, useMemo, useRef, useState } from 'react';

export interface LatLng { lat: number; lng: number }
export interface MapPoint extends LatLng { id: string; risk: number; label: string; highlight?: boolean }
export interface MapLine { id: string; from: LatLng; to: LatLng; label: string; active?: boolean }
interface Props { points: MapPoint[]; lines?: MapLine[]; onSelect?: (id: string) => void; height?: number }

export const riskColor = (r: number) => (r >= 0.5 ? '#dc2626' : r >= 0.2 ? '#f59e0b' : '#10b981');
const KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const hasKey = !!KEY && !KEY.startsWith('YOUR_');

let loader: Promise<void> | undefined;
let broken = false;
function loadMaps() {
  return (loader ??= new Promise<void>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    w.__scMapsReady = () => resolve();
    w.gm_authFailure = () => { broken = true; dispatchEvent(new Event('sc-maps-failed')); };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&callback=__scMapsReady`;
    s.async = true;
    s.onerror = () => { broken = true; reject(new Error('maps load failed')); };
    document.head.appendChild(s);
  }));
}

export default function MapView(props: Props) {
  const [failed, setFailed] = useState(!hasKey || broken);
  useEffect(() => {
    const f = () => setFailed(true);
    addEventListener('sc-maps-failed', f);
    return () => removeEventListener('sc-maps-failed', f);
  }, []);
  return (
    <div>
      {failed ? <SvgMap {...props} /> : <GoogleMap {...props} onFail={() => setFailed(true)} />}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="font-medium">Stock-out risk:</span>
        {[['Low', 0], ['Medium', 0.3], ['High', 0.8]].map(([l, r]) => (
          <span key={l} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: riskColor(r as number) }} />{l}</span>
        ))}
        {!!props.lines?.length && <span className="flex items-center gap-1"><span className="h-0.5 w-5 bg-teal-600" />→ proposed transfer</span>}
        {failed && <span className="ml-auto text-slate-400">Preview map · set VITE_GOOGLE_MAPS_API_KEY for Google Maps</span>}
      </div>
    </div>
  );
}

function GoogleMap({ points, lines = [], onSelect, height = 380, onFail }: Props & { onFail: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const polys = useRef<google.maps.Polyline[]>([]);
  const sel = useRef(onSelect);
  sel.current = onSelect;
  const [ready, setReady] = useState(false);
  const fitKey = useMemo(() => points.map((p) => p.id).join() + lines.map((l) => l.id).join(), [points, lines]);

  useEffect(() => {
    loadMaps().then(() => {
      if (!el.current || map.current) return;
      const m = new google.maps.Map(el.current, {
        center: { lat: 20.5, lng: 79 }, zoom: 5, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }],
      });
      m.data.addListener('click', (e: google.maps.Data.MouseEvent) => sel.current?.(e.feature.getProperty('id') as string));
      m.data.setStyle((f) => {
        const halo = f.getProperty('halo'), r = f.getProperty('risk') as number, hl = f.getProperty('highlight');
        return {
          clickable: !halo, title: f.getProperty('label') as string, zIndex: halo ? 1 : 2,
          icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: riskColor(r), scale: halo ? 12 + r * 24 : hl ? 8 : 5.5, fillOpacity: halo ? 0.2 : 0.95, strokeColor: hl ? '#0f172a' : '#ffffff', strokeWeight: halo ? 0 : hl ? 2.5 : 1.5 },
        };
      });
      map.current = m;
      setReady(true);
    }).catch(onFail);
  }, [onFail]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.data.forEach((f) => m.data.remove(f));
    for (const p of points) for (const halo of [true, false])
      m.data.add({ geometry: new google.maps.Data.Point({ lat: p.lat, lng: p.lng }), properties: { ...p, halo } });
    polys.current.forEach((p) => p.setMap(null));
    polys.current = lines.map((l) => new google.maps.Polyline({
      map: m, path: [l.from, l.to], strokeColor: '#0f766e', strokeOpacity: l.active ? 1 : 0.55, strokeWeight: l.active ? 5 : 2.5, zIndex: l.active ? 5 : 3,
      icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: l.active ? 4 : 3 }, offset: '100%' }],
    }));
  }, [ready, points, lines]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const b = new google.maps.LatLngBounds();
    [...points, ...lines.flatMap((l) => [l.from, l.to])].forEach((x) => b.extend(x));
    if (b.isEmpty()) return;
    m.fitBounds(b, 40);
    if (points.length === 1 && !lines.length) m.setZoom(11);
  }, [ready, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-xl bg-slate-100" role="region" aria-label="Map of PHC stock-out risk" />;
}

function SvgMap({ points, lines = [], onSelect, height = 380 }: Props) {
  const W = 800, H = Math.round(W * (height / 640));
  const all = [...points, ...lines.flatMap((l) => [l.from, l.to])];
  if (!all.length) return <div style={{ height }} className="grid place-items-center rounded-xl bg-slate-100 text-sm text-slate-500">No facilities to show</div>;
  const lats = all.map((p) => p.lat), lngs = all.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2, k = Math.cos((midLat * Math.PI) / 180);
  const spanX = Math.max((Math.max(...lngs) - Math.min(...lngs)) * k, 0.4), spanY = Math.max(Math.max(...lats) - Math.min(...lats), 0.4);
  const s = Math.min((W - 80) / spanX, (H - 80) / spanY);
  const cx = ((Math.min(...lngs) + Math.max(...lngs)) / 2) * k, cy = midLat;
  const pr = (p: LatLng): [number, number] => [W / 2 + (p.lng * k - cx) * s, H / 2 - (p.lat - cy) * s];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="w-full rounded-xl bg-gradient-to-br from-slate-50 to-teal-50/60 ring-1 ring-slate-200" role="img" aria-label="Map of PHC stock-out risk">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#e2e8f0" strokeWidth="1" /></pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#0f766e" /></marker>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />
      {points.map((p) => { const [x, y] = pr(p); return <circle key={'h' + p.id} cx={x} cy={y} r={12 + p.risk * 26} fill={riskColor(p.risk)} opacity={0.18} />; })}
      {lines.map((l) => { const [x1, y1] = pr(l.from), [x2, y2] = pr(l.to); return <line key={l.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0f766e" strokeWidth={l.active ? 4 : 2} opacity={l.active ? 1 : 0.5} markerEnd="url(#arrow)"><title>{l.label}</title></line>; })}
      {points.map((p) => {
        const [x, y] = pr(p);
        return (
          <circle key={p.id} cx={x} cy={y} r={p.highlight ? 8 : 5.5} fill={riskColor(p.risk)} stroke={p.highlight ? '#0f172a' : '#fff'} strokeWidth={p.highlight ? 2.5 : 1.5}
            className={onSelect ? 'cursor-pointer' : ''} onClick={() => onSelect?.(p.id)}><title>{p.label}</title></circle>
        );
      })}
    </svg>
  );
}
