import { ArrowRight } from 'lucide-react';

const tones = {
  blue: { accent: 'border-t-blue-600', iconBg: 'bg-blue-50', iconText: 'text-blue-700' },
  cyan: { accent: 'border-t-cyan-600', iconBg: 'bg-cyan-50', iconText: 'text-cyan-700' },
  emerald: { accent: 'border-t-emerald-600', iconBg: 'bg-emerald-50', iconText: 'text-emerald-700' },
  green: { accent: 'border-t-green-600', iconBg: 'bg-green-50', iconText: 'text-green-700' },
  indigo: { accent: 'border-t-indigo-600', iconBg: 'bg-indigo-50', iconText: 'text-indigo-700' },
  orange: { accent: 'border-t-orange-600', iconBg: 'bg-orange-50', iconText: 'text-orange-700' },
  purple: { accent: 'border-t-violet-600', iconBg: 'bg-violet-50', iconText: 'text-violet-700' },
  red: { accent: 'border-t-red-600', iconBg: 'bg-red-50', iconText: 'text-red-700' },
  teal: { accent: 'border-t-teal-600', iconBg: 'bg-teal-50', iconText: 'text-teal-700' },
  yellow: { accent: 'border-t-amber-600', iconBg: 'bg-amber-50', iconText: 'text-amber-700' },
};

const DashboardMetricCard = ({ label, value, detail, icon: Icon, tone = 'teal', actionLabel, onAction }) => {
  const toneClasses = tones[tone] || tones.teal;

  return (
    <article className={`min-w-0 rounded-lg border border-slate-200 border-t-2 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${toneClasses.accent}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <p className="mt-3 break-words text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
          {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
          {actionLabel && onAction && (
            <button onClick={onAction} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-950">
              {actionLabel}
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-md ${toneClasses.iconBg} ${toneClasses.iconText}`}>
          {Icon && <Icon aria-hidden="true" className="size-5" />}
        </span>
      </div>
    </article>
  );
};

export default DashboardMetricCard;