import type { Backend } from '../client';
import { mockRealtime } from '../mockRealtime';
import { mockAuth } from './auth';
import { createMockCaregiverApi } from './caregiver';
import { createMockPatientApi } from './patient';

export const mockBackend: Backend = {
  auth: mockAuth,
  patient: createMockPatientApi,
  caregiver: createMockCaregiverApi,
  realtime: mockRealtime,
};
