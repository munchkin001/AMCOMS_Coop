import React from 'react';

const ReportInsights = ({
  metrics = [],
  highlights = [],
  challenges = [],
  opportunities = [],
  breakdowns = [],
  scopeNote
}) => (
  <section className="my-6 space-y-5 break-inside-avoid-page" aria-label="Report analysis">
    <div>
      <h2 className="mb-3 border-b border-slate-300 pb-2 text-lg font-bold text-slate-900">Key Metrics Overview</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600">{metric.label}</p>
            <p className="mt-1 break-words text-lg font-bold tabular-nums text-slate-900">{metric.value}</p>
            {metric.detail && <p className="mt-1 text-xs text-slate-600">{metric.detail}</p>}
          </div>
        ))}
      </div>
    </div>

    {breakdowns.map((breakdown) => (
      <div key={breakdown.title}>
        <h3 className="mb-2 text-sm font-bold text-slate-900">{breakdown.title}</h3>
        {breakdown.items?.length ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">{breakdown.labelHeading || 'Category'}</th>
                  <th className="px-3 py-2 text-right font-semibold">{breakdown.valueHeading || 'Value'}</th>
                  {breakdown.detailHeading && <th className="px-3 py-2 font-semibold">{breakdown.detailHeading}</th>}
                </tr>
              </thead>
              <tbody>
                {breakdown.items.map((item) => (
                  <tr key={item.label} className="border-t border-slate-100 odd:bg-white even:bg-slate-50">
                    <td className="px-3 py-2 text-slate-800">{item.label}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">{item.value}</td>
                    {breakdown.detailHeading && <td className="px-3 py-2 text-slate-600">{item.detail || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">No records are available for this breakdown in the selected scope.</p>
        )}
      </div>
    ))}

    <div className="grid gap-4 md:grid-cols-3">
      {[
        ['Performance Highlights', highlights, 'text-blue-900'],
        ['Challenges / Risks', challenges, 'text-amber-900'],
        ['Opportunities / Recommended Follow-up', opportunities, 'text-emerald-900']
      ].map(([title, items, headingColor]) => (
        <section key={title} className="rounded-lg border border-slate-200 p-3">
          <h3 className={`text-sm font-bold ${headingColor}`}>{title}</h3>
          {items.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No specific items identified from the available report data.</p>
          )}
        </section>
      ))}
    </div>
    {scopeNote && <p className="text-xs leading-relaxed text-slate-500">{scopeNote}</p>}
  </section>
);

export default ReportInsights;
