const KEY = 'nexpill.token';

/**
 * "Keep me signed in" → localStorage (survives restarts, shared by all tabs).
 * Otherwise sessionStorage (this tab only, so two tabs can be signed in as different users).
 */
export const tokenStore = {
  get(): string | null {
    try { return sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY); } catch { return null; }
  },
  set(token: string, persistent: boolean) {
    this.clear();
    try { (persistent ? localStorage : sessionStorage).setItem(KEY, token); } catch { /* ignore */ }
  },
  clear() {
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
};
