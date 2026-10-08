import { ArrowLeft, ArrowRight, ClipboardList, MapPin, Sprout } from 'lucide-react';
import { Link } from 'react-router-dom';

const PortalSelection = () => {
  const portals = [
    {
      id: 'staff',
      title: 'Staff Portal',
      helpLabel: 'Login help for Staff',
      Icon: ClipboardList,
      iconStyle: 'from-blue-400 via-blue-600 to-blue-800 text-white shadow-[0_0_28px_rgba(37,99,235,0.55)] ring-blue-200/40',
      cardStyle: 'border-cyan-300/30 bg-slate-900/60 shadow-[0_18px_50px_rgba(2,132,199,0.18)] hover:border-cyan-200/75 hover:shadow-[0_0_34px_rgba(34,211,238,0.3)]',
      actionStyle: 'border-cyan-200/80 bg-blue-700/30 text-white shadow-[inset_0_0_16px_rgba(34,211,238,0.12),0_0_22px_rgba(34,211,238,0.22)] hover:bg-blue-600/40',
      helpStyle: 'text-cyan-100 decoration-cyan-100/40 hover:text-white hover:decoration-white'
    },
    {
      id: 'member',
      title: 'Member Portal',
      helpLabel: 'Login help for Members',
      Icon: Sprout,
      iconStyle: 'from-amber-200 via-amber-400 to-orange-600 text-amber-950 shadow-[0_0_28px_rgba(245,158,11,0.42)] ring-amber-100/50',
      cardStyle: 'border-amber-300/30 bg-slate-900/60 shadow-[0_18px_50px_rgba(180,83,9,0.18)] hover:border-amber-200/75 hover:shadow-[0_0_34px_rgba(251,191,36,0.28)]',
      actionStyle: 'border-amber-200/80 bg-amber-500/20 text-white shadow-[inset_0_0_16px_rgba(251,191,36,0.12),0_0_22px_rgba(251,191,36,0.2)] hover:bg-amber-400/30',
      helpStyle: 'text-amber-100 decoration-amber-100/40 hover:text-white hover:decoration-white'
    }
  ];

  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-[#071c17] px-5 py-6 text-white sm:px-8 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: 'url(/5.jpg)' }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(120deg,rgba(7,28,23,0.88),rgba(15,56,43,0.76)_52%,rgba(7,28,23,0.88))]" />

      <header className="mx-auto flex w-full max-w-6xl items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-[#E9C46A]/35 bg-emerald-100/10 shadow-[0_0_34px_rgba(233,196,106,0.18)] backdrop-blur-sm sm:h-[4.5rem] sm:w-[4.5rem]">
          <img src="/LOGO.png" alt="Agay-ayan Multi-Purpose Cooperative" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl">AMCOMS</h1>
          <p className="mt-1 text-xs font-medium text-slate-200 sm:text-sm">Agay-ayan Multi-Purpose Cooperative Management System</p>
        </div>
      </header>

      <section aria-labelledby="portal-heading" className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-12 sm:py-14">
        <div className="mb-8 text-center sm:mb-10">
          <p className="mb-3 text-xs font-semibold uppercase text-[#E9C46A] sm:text-sm">AGAY-AYAN MULTI-PURPOSE COOPERATIVE</p>
          <h2 id="portal-heading" className="text-3xl font-bold text-white sm:text-4xl">Select Your Portal</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
            Access your administrative tools or member account securely.
          </p>
          <div aria-hidden="true" className="mx-auto mt-7 h-px w-24 bg-gradient-to-r from-transparent via-[#E9C46A] to-transparent" />
        </div>

        <div className="grid grid-cols-2 gap-[5px] sm:gap-4 md:gap-6">
          {portals.map(({ id, title, helpLabel, Icon, iconStyle, cardStyle, actionStyle, helpStyle }, index) => (
            <article
              key={id}
              style={{ animationDelay: `${index * 120}ms` }}
              className={`portal-enter group relative flex min-h-[286px] flex-col items-center overflow-hidden rounded-xl border-2 p-3 shadow-xl backdrop-blur-md transition duration-300 hover:-translate-y-1.5 sm:min-h-[390px] sm:p-8 ${cardStyle}`}
            >
              <span aria-hidden="true" className={`relative z-10 mt-1 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ring-1 sm:mt-2 sm:h-20 sm:w-20 sm:rounded-2xl md:h-24 md:w-24 ${iconStyle}`}>
                <Icon aria-hidden="true" size={30} className="sm:h-[42px] sm:w-[42px]" strokeWidth={1.8} />
              </span>

              <h3 className="relative z-10 mt-3 text-center text-base font-bold text-white sm:mt-7 sm:text-3xl">{title}</h3>

              <div className="relative z-10 mt-auto w-full pt-5 sm:pt-10">
                <Link
                  to={`/login/${id}`}
                  className={`flex min-h-12 w-full items-center justify-center gap-1 rounded-full border px-2 py-3 text-xs font-semibold transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:gap-3 sm:px-5 sm:text-sm ${actionStyle}`}
                >
                  <span className="sm:hidden">Continue</span>
                  <span className="hidden sm:inline">Continue to Login</span>
                  <ArrowRight aria-hidden="true" size={16} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none sm:h-[18px] sm:w-[18px]" />
                </Link>
                <Link
                  to="/forgot-password"
                  className={`mx-auto mt-2 flex min-h-9 w-full items-center justify-center rounded px-0 text-[10px] leading-tight underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:mt-4 sm:min-h-11 sm:w-fit sm:px-3 sm:text-sm ${helpStyle}`}
                >
                  {helpLabel}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 border-t border-white/15 pt-5 text-sm text-slate-200 sm:flex-row">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center sm:justify-start sm:text-left">
          <MapPin aria-hidden="true" size={16} className="text-[#E9C46A]" />
          <span>Agay-ayan Multi-Purpose Cooperative</span>
          <span aria-hidden="true" className="text-white/40">|</span>
          <span>Agay-ayan, Gingoog City, Misamis Oriental</span>
          <span className="relative ml-1 flex h-2.5 w-2.5" role="img" aria-label="Online">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-50 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </span>
        </div>
        <Link to="/" className="group inline-flex min-h-11 items-center gap-2 font-medium text-white transition-colors hover:text-[#E9C46A] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E9C46A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071c17]">
          <ArrowLeft aria-hidden="true" size={16} className="transition-transform duration-200 group-hover:-translate-x-1 motion-reduce:transition-none" />
          Back to Website
        </Link>
      </footer>
    </main>
  );
};

export default PortalSelection;
