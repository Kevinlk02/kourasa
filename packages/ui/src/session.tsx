import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Country, Profile } from '@koursa/shared';
import { getSupabase } from './supabase';

interface SessionState {
  session: Session | null;
  profile: Profile | null;
  country: Country | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const sb = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string | undefined) {
    if (!uid) {
      setProfile(null);
      return;
    }
    const { data } = await sb.from('profiles').select('id, role, full_name, phone, city_id').eq('id', uid).maybeSingle();
    setProfile(data as Profile | null);
  }

  useEffect(() => {
    sb.from('countries').select('code, name, currency, dial_code, active').eq('active', true).order('code').limit(1)
      .then(({ data }) => setCountry((data?.[0] as Country) ?? { code: 'TG', name: 'Togo', currency: 'XOF', dial_code: '+228', active: true }));
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      loadProfile(s?.user.id);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Ctx.Provider
      value={{
        session,
        profile,
        country,
        loading,
        refreshProfile: () => loadProfile(session?.user.id),
        signOut: async () => {
          await sb.auth.signOut();
          setProfile(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession hors SessionProvider');
  return v;
}
