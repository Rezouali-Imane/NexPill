import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { backend } from '@/api';
import type { Role, Session, SignUpInput } from '@/domain/auth';
import { tokenStore } from './tokenStore';

interface AuthCtx {
  status: 'loading' | 'ready';
  session: Session | null;
  signIn(email: string, password: string, remember: boolean): Promise<Session>;
  signUp(input: SignUpInput, remember?: boolean): Promise<Session>;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
export const homeFor = (role: Role) => (role === 'patient' ? '/patient' : '/caregiver');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthCtx['status']>('loading');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let alive = true;
    const token = tokenStore.get();
    (async () => {
      const s = token ? await backend.auth.getSession(token).catch(() => null) : null;
      if (!alive) return;
      if (!s) tokenStore.clear();
      setSession(s);
      setStatus('ready');
    })();
    return () => { alive = false; };
  }, []);

  const signIn = useCallback<AuthCtx['signIn']>(async (email, password, remember) => {
    const s = await backend.auth.signIn(email, password);
    tokenStore.set(s.token, remember);
    setSession(s);
    return s;
  }, []);

  const signUp = useCallback<AuthCtx['signUp']>(async (input, remember = false) => {
    const s = await backend.auth.signUp(input);
    tokenStore.set(s.token, remember);
    setSession(s);
    return s;
  }, []);

  const signOut = useCallback(async () => {
    const token = tokenStore.get();
    tokenStore.clear();
    setSession(null);
    if (token) await backend.auth.signOut(token).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ status, session, signIn, signUp, signOut }), [status, session, signIn, signUp, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>');
  return c;
}
