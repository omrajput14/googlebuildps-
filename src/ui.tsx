import type { ReactNode } from 'react';
import { Eye, OctagonAlert, ShieldCheck, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Severity } from './data/engine';
import type { Source } from './gemini';
import { translate, type Lang } from './i18n';

// Severity is always icon + text + colour (never colour alone).
export const SEV: Record<Severity, { label: string; icon: LucideIcon; cls: string; dot: string }> = {
  critical: { label: 'Critical', icon: OctagonAlert, cls: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-600' },
  warning: { label: 'Warning', icon: TriangleAlert, cls: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  watch: { label: 'Watch', icon: Eye, cls: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' },
};

export function SevBadge({ sev, t }: { sev: Severity; t: (s: string) => string }) {
  const { label, icon: Icon, cls } = SEV[sev];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cls}`}><Icon size={13} aria-hidden />{t(label)}</span>;
}

export function Card({ title, icon: Icon, action, children, className = '' }: { title?: ReactNode; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center gap-2">
          {Icon && <Icon size={18} className="text-teal-600" />}
          <h2 className="flex-1 font-semibold text-slate-800">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, icon: Icon, tone = 'teal' }: { label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; tone?: 'teal' | 'red' | 'amber' | 'slate' }) {
  const tones = { teal: 'bg-teal-50 text-teal-700', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', slate: 'bg-slate-100 text-slate-600' };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon size={19} /></span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="text-xl font-bold leading-tight tabular-nums">{value}</div>
        {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function PrivacyBadge({ className = '', dark = false, lang = 'en' as Lang }) {
  return (
    <span title="Facility-level aggregates only. No patient names, IDs or records are stored or shared."
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${dark ? 'bg-white/15 text-white' : 'bg-teal-50 text-teal-800 ring-1 ring-teal-200'} ${className}`}>
      <ShieldCheck size={14} /> {translate(lang, 'Privacy by design')} · {translate(lang, 'No patient-identifiable data')}
    </span>
  );
}

export function SourceTag({ source }: { source: Source }) {
  return source === 'gemini'
    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700"><Sparkles size={12} /> Gemini</span>
    : <span className="text-xs text-slate-500">Offline template (Gemini unavailable)</span>;
}

export function DaysPill({ days, max = 60 }: { days: number; max?: number }) {
  const cls = days <= 7 ? 'text-red-700 font-bold' : days <= 14 ? 'text-amber-700 font-semibold' : days <= 21 ? 'text-sky-700 font-medium' : 'text-slate-600';
  return <span className={`tabular-nums ${cls}`}>{days >= max ? `${max}+` : days}</span>;
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
