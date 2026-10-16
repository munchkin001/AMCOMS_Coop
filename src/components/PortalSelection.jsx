import { ArrowLeft, ArrowRight, MapPin, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';

const PortalSelection = () => {
  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-[#071c17] px-5 py-6 text-white sm:px-8 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: 'url(/5.jpg)' }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(120deg,rgba(7,28,23,0.88),rgba(15,56,43,0.76)_52%,rgba(7,28,23,0.88))]" />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            to="/"
            aria-label="AMCOMS homepage"
            title="AMCOMS homepage"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#E9C46A]/35 bg-emerald-100/10 shadow-[0_0_34px_rgba(233,196,106,0.18)] backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E9C46A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071c17] sm:h-[4.5rem] sm:w-[4.5rem]"
          >
            <img src="/LOGO.png" alt="" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl">AMCOMS</h1>
            <p className="mt-1 text-xs font-medium text-slate-200 sm:text-sm">Agay-ayan Multi-Purpose Cooperative Management System</p>
          </div>
        </div>
      </header>

      <section aria-labelledby="portal-heading" className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-12 sm:py-14">
        <div className="mb-8 text-center sm:mb-10">
          <p className="mb-3 text-xs font-semibold uppercase text-[#E9C46A] sm:text-sm">AGAY-AYAN MULTI-PURPOSE COOPERATIVE</p>
          <h2 id="portal-heading" className="text-3xl font-bold text-white sm:text-4xl">Your Member Portal</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
            Sign in to access your cooperative account, view your information, and stay connected.
          </p>
          <div aria-hidden="true" className="mx-auto mt-7 h-px w-24 bg-gradient-to-r from-transparent via-[#E9C46A] to-transparent" />
        </div>

        <article className="portal-enter mx-auto flex w-full max-w-2xl flex-col items-center rounded-2xl border-2 border-amber-200/50 bg-slate-900/70 p-6 text-center shadow-[0_24px_70px_rgba(180,83,9,0.24)] backdrop-blur-md sm:p-10">
          <span aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 via-amber-400 to-orange-600 text-amber-950 shadow-[0_0_32px_rgba(245,158,11,0.4)] ring-1 ring-amber-100/60 sm:h-24 sm:w-24">
            <UserRound aria-hidden="true" size={44} strokeWidth={1.8} />
          </span>
          <h3 className="mt-5 text-2xl font-bold text-white sm:mt-7 sm:text-3xl">Member Portal</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-200 sm:text-base">
            A secure place to manage your membership and keep up with your cooperative.
          </p>
          <Link
            to="/login/member"
            className="group mt-7 flex min-h-14 w-full max-w-sm items-center justify-center gap-3 rounded-full border border-amber-200/80 bg-amber-500/20 px-6 py-3 text-base font-semibold text-white shadow-[inset_0_0_16px_rgba(251,191,36,0.12),0_0_22px_rgba(251,191,36,0.2)] transition duration-200 hover:-translate-y-0.5 hover:bg-amber-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Member sign in
            <ArrowRight aria-hidden="true" size={18} className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" />
          </Link>
          <Link
            to="/forgot-password"
            className="mt-3 inline-flex min-h-11 items-center rounded px-3 text-sm text-amber-100 underline decoration-amber-100/40 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Login help for Members
          </Link>
        </article>
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
