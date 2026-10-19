'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AdminProvider, useAdmin } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

const NAV = [
  ['/admin', 'Tableau de bord'],
  ['/admin/carte', 'Carte en direct'],
  ['/admin/zones', 'Zones'],
  ['/admin/courses', 'Courses'],
  ['/admin/coursiers', 'Coursiers'],
  ['/admin/incidents', 'Incidents & litiges'],
  ['/admin/tarifs', 'Tarifs'],
  ['/admin/lieux', 'Restaurants'],
  ['/admin/versions', 'Versions des apps'],
  ['/admin/google', 'Appels Google'],
] as const;

function Login() {
  const sb = supabase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Back-office Koursa</h1>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const { error: err } = await sb.auth.signInWithPassword({ email, password });
        setBusy(false);
        if (err) setError('Identifiants incorrects');
      }}>
        <input className="input" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input className="input" type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button className="btn-primary w-full" disabled={busy}>Se connecter</button>
      </form>
    </main>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { session, isAdmin, cities, city, setCityId } = useAdmin();
  const path = usePathname();
  if (session === undefined) return <p className="p-8 text-muted">Chargement…</p>;
  if (session === null) return <Login />;
  if (isAdmin === null) return <p className="p-8 text-muted">Chargement…</p>;
  if (!isAdmin) {
    return (
      <main className="p-8">
        <p>Accès réservé aux administrateurs.</p>
        <button className="btn-sm mt-4 bg-surface" onClick={() => supabase().auth.signOut()}>Se déconnecter</button>
      </main>
    );
  }
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-line p-3 md:flex">
        <Link href="/admin" className="mb-3 flex items-center gap-2 px-2 text-lg font-extrabold">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent text-sm text-white">K</span> Admin
        </Link>
        <select className="input mb-3 h-9" value={city?.id ?? ''} onChange={(e) => setCityId(e.target.value)}>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (inactive)'}</option>)}
        </select>
        {NAV.map(([href, label]) => (
          <Link key={href} href={href}
            className={`rounded-lg px-3 py-2 text-[14px] font-medium ${path === href ? 'bg-ink text-white' : 'hover:bg-surface'}`}>
            {label}
          </Link>
        ))}
        <div className="flex-1" />
        <button className="px-3 py-2 text-left text-sm text-muted" onClick={() => supabase().auth.signOut()}>Se déconnecter</button>
      </aside>
      <div className="min-w-0 flex-1">
        <nav className="flex gap-2 overflow-x-auto border-b border-line p-2 md:hidden">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${path === href ? 'bg-ink text-white' : 'bg-surface'}`}>{label}</Link>
          ))}
        </nav>
        <div className="p-4 md:p-6">{city ? children : <p className="text-muted">Chargement…</p>}</div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminProvider>
      <Shell>{children}</Shell>
    </AdminProvider>
  );
}
