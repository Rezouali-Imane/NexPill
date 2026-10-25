import { Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireRole, RootRedirect } from '@/auth/guards';
import { useAuth } from '@/auth/AuthContext';
import Forgot from '@/pages/auth/Forgot';
import Reset from '@/pages/auth/Reset';
import SignIn from '@/pages/auth/SignIn';
import SignUp from '@/pages/auth/SignUp';
import Welcome from '@/pages/auth/Welcome';
import Alerts from '@/pages/caregiver/Alerts';
import CaregiverArea from '@/pages/caregiver/CaregiverArea';
import Dashboard from '@/pages/caregiver/Dashboard';
import { CaregiverHelp, CaregiverSettings, ComingSoon, InsightsPage, SchedulePage } from '@/pages/caregiver/Others';
import Patients from '@/pages/caregiver/Patients';
import Caregivers from '@/pages/Caregivers';
import Help from '@/pages/Help';
import History from '@/pages/History';
import Medications from '@/pages/Medications';
import NotFound from '@/pages/NotFound';
import Overview from '@/pages/Overview';
import PatientArea from '@/pages/PatientArea';
import Schedule from '@/pages/Schedule';
import Settings from '@/pages/Settings';

export default function App() {
  useAuth();
  return (
    <Routes>
      <Route index element={<RootRedirect />} />
      <Route element={<GuestOnly />}>
        <Route path="welcome" element={<Welcome />} />
        <Route path="signup/:role" element={<SignUp />} />
        <Route path="signin" element={<SignIn />} />
        <Route path="forgot-password" element={<Forgot />} />
      </Route>
      <Route path="reset-password" element={<Reset />} />

      <Route path="patient" element={<RequireRole role="patient" />}>
        <Route element={<PatientArea />}>
          <Route index element={<Overview />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="medications" element={<Medications />} />
          <Route path="history" element={<History />} />
          <Route path="caregivers" element={<Caregivers />} />
          <Route path="help" element={<Help />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route path="caregiver" element={<RequireRole role="caregiver" />}>
        <Route element={<CaregiverArea />}>
          <Route index element={<Dashboard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="safety" element={<ComingSoon title="Safety checks" icon="shield" text="Medication database, interaction checks and duplicate warnings before a new medication can be scheduled." />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="device" element={<ComingSoon title="NexPill device" icon="device" text="Live simulation of the NexPill device: which compartment opens, and when." />} />
          <Route path="help" element={<CaregiverHelp />} />
          <Route path="settings" element={<CaregiverSettings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
