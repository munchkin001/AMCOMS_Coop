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

const solidTones = {
  green: 'from-green-500 to-green-700',
  indigo: 'from-indigo-500 to-indigo-700',
  orange: 'from-orange-500 to-orange-600',
  red: 'from-rose-500 to-red-600',
  blue: 'from-blue-500 to-blue-700',
  teal: 'from-teal-500 to-teal-700'
};

const DashboardMetricCard = ({ label, value, icon: Icon, tone = 'teal', actionLabel, onAction, onClick, solid = false }) => {
  const toneClasses = tones[tone] || tones.teal;
  const Container = onClick ? 'button' : 'article';
  const interactionClasses = onClick
    ? 'w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2'
    : '';

  if (solid) {
    return (
      <Container
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        aria-label={onClick ? `View ${label.toLowerCase()} details` : undefined}
        className={`${interactionClasses} min-w-0 rounded-xl bg-gradient-to-br p-3 text-white shadow-md sm:p-4 ${solidTones[tone] || solidTones.teal}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-white/80">{label}</p>
            <p className="mt-2 break-words text-lg font-semibold tabular-nums sm:mt-3 sm:text-2xl">{value}</p>
            {onClick ? (
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white">
                {actionLabel || 'View details'}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </span>
            ) : actionLabel && onAction ? (
              <button onClick={onAction} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white hover:underline">
                {actionLabel}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </button>
            ) : null}
          </div>
          <span className="hidden size-10 shrink-0 place-items-center rounded-md bg-white/20 sm:grid">
            {Icon && <Icon aria-hidden="true" className="size-5" />}
          </span>
        </div>
      </Container>
    );
  }

  return (
    <Container
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={onClick ? `View ${label.toLowerCase()} details` : undefined}
      className={`${interactionClasses} min-w-0 rounded-xl border border-slate-200 border-t-4 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${toneClasses.accent}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <p className="mt-3 break-words text-2xl font-extrabold tabular-nums tracking-tight text-slate-950">{value}</p>
          {onClick ? (
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
              {actionLabel || 'View details'}
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </span>
          ) : actionLabel && onAction ? (
            <button onClick={onAction} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-950">
              {actionLabel}
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
        </div>
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${toneClasses.iconBg} ${toneClasses.iconText}`}>
          {Icon && <Icon aria-hidden="true" className="size-5" />}
        </span>
      </div>
    </Container>
  );
};

export default DashboardMetricCard;