import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ConnectionState } from '@/domain/types';

export interface Toast { id: number; tone: 'success' | 'info' | 'error'; text: string }

interface UiCtx {
  toasts: Toast[];
  announcement: string;
  connection: ConnectionState;
  toast(tone: Toast['tone'], text: string): void;
  announce(text: string): void;
  dismissToast(id: number): void;
  setConnection(s: ConnectionState): void;
}

const Ctx = createContext<UiCtx | null>(null);
let nextId = 1;

/** App-wide, role-independent UI state: toasts, screen-reader announcements, connection status. */
export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [connection, setConnection] = useState<ConnectionState>('closed');

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((tone: Toast['tone'], text: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, tone, text }]);
    window.setTimeout(() => dismissToast(id), 6000);
  }, [dismissToast]);
  // Toggle the text so identical consecutive messages are still announced.
  const announce = useCallback((text: string) => setAnnouncement((p) => (p === text ? `${text} ` : text)), []);

  const value = useMemo(
    () => ({ toasts, announcement, connection, toast, announce, dismissToast, setConnection }),
    [toasts, announcement, connection, toast, announce, dismissToast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUi must be used inside <UiProvider>');
  return c;
}
