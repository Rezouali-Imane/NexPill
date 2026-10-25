import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/domain/auth';
import { homeFor, useAuth } from './AuthContext';

const Loading = () => <p role="status" style={{ padding: 40, fontSize: '1.25rem' }}>Loading…</p>;

/** Signed-out visitors go to /welcome; signed-in users of the other role go to their own area. */
export function RequireRole({ role }: { role: Role }) {
  const { status, session } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <Loading />;
  if (!session) return <Navigate to="/welcome" replace state={{ from: loc.pathname }} />;
  if (session.user.role !== role) return <Navigate to={homeFor(session.user.role)} replace />;
  return <Outlet />;
}

/** Auth screens are for signed-out visitors only. */
export function GuestOnly() {
  const { status, session } = useAuth();
  if (status === 'loading') return <Loading />;
  if (session) return <Navigate to={homeFor(session.user.role)} replace />;
  return <Outlet />;
}

export function RootRedirect() {
  const { status, session } = useAuth();
  if (status === 'loading') return <Loading />;
  return <Navigate to={session ? homeFor(session.user.role) : '/welcome'} replace />;
}
