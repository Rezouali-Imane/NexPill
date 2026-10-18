import type { IconName } from '@/components/ui/Icon';

export interface NavItem { to: string; label: string; icon: IconName; end?: boolean; badge?: number }

export const PATIENT_NAV: NavItem[] = [
  { to: '/patient', label: 'Overview', icon: 'overview', end: true },
  { to: '/patient/schedule', label: 'Schedule', icon: 'schedule' },
  { to: '/patient/medications', label: 'Medications', icon: 'pill' },
  { to: '/patient/history', label: 'History', icon: 'history' },
  { to: '/patient/caregivers', label: 'My caregivers', icon: 'users' },
];

export const PATIENT_NAV_SECONDARY: NavItem[] = [
  { to: '/patient/help', label: 'Help & support', icon: 'help' },
  { to: '/patient/settings', label: 'Settings', icon: 'settings' },
];

export const CAREGIVER_NAV: NavItem[] = [
  { to: '/caregiver', label: 'Overview', icon: 'overview', end: true },
  { to: '/caregiver/patients', label: 'Patients', icon: 'users' },
  { to: '/caregiver/schedule', label: 'Schedule', icon: 'schedule' },
  { to: '/caregiver/safety', label: 'Safety checks', icon: 'shield' },
  { to: '/caregiver/insights', label: 'Insights', icon: 'insights' },
  { to: '/caregiver/alerts', label: 'Alerts', icon: 'bell' },
  { to: '/caregiver/device', label: 'NexPill device', icon: 'device' },
];

export const CAREGIVER_NAV_SECONDARY: NavItem[] = [
  { to: '/caregiver/help', label: 'Help & support', icon: 'help' },
  { to: '/caregiver/settings', label: 'Settings', icon: 'settings' },
];
