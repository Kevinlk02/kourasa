import Link from 'next/link';
import type { ReactNode } from 'react';

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
      <Link href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">K</span>
        Koursa
      </Link>
      <nav aria-label="Navigation principale" className="flex items-center gap-4 text-[15px] font-medium sm:gap-5">
        <Link href="/coursiers" className="text-sm sm:text-[15px]"><span className="sm:hidden">Coursiers</span><span className="hidden sm:inline">Devenir coursier</span></Link>
        <Link href="/telecharger" className="btn-sm bg-ink text-white">Télécharger</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Koursa — Lomé, Togo</p>
        <div className="flex gap-5">
          <Link href="/mentions-legales">Mentions légales</Link>
          <Link href="/confidentialite">Confidentialité</Link>
          <Link href="/coursiers">Coursiers</Link>
        </div>
      </div>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5">{children}</main>
      <SiteFooter />
    </>
  );
}
