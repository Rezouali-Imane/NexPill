import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server, Socket } from "socket.io";

const { mockGetUser, mockPrisma } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockPrisma: {
    user: { findUnique: vi.fn() },
    caregiverAccess: { findMany: vi.fn() },
  },
}));

vi.mock("../src/config/supabase", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

vi.mock("../src/db/prisma", () => ({ prisma: mockPrisma }));

import {
  emitDoseUpdate,
  emitAgentInsight,
  emitAdherenceUpdate,
  emitAlertCreated,
  initializeDoseRealtime,
  closeDoseRealtime,
  setRealtimeServerForTesting,
} from "../src/realtime/dose-events";
import { createServer } from "node:http";

describe("Real-time Updates & Caregiver Access Permissions", () => {
  const patientId = "a0000000-0000-4000-8000-000000000001";
  const caregiverId = "b0000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    vi.resetAllMocks();
    setRealtimeServerForTesting(null);
  });

  describe("Real-time Event Emitters", () => {
    it("safely handles emit calls when no socket server is active", () => {
      expect(() => {
        emitDoseUpdate({ doseId: "d1", patientId, status: "TAKEN" });
        emitAgentInsight({
          patientId,
          actorUserId: caregiverId,
          query: "Adherence check",
          response: "Adherence is 95%",
          safeguardTriggered: false,
          toolsInvoked: ["detect_adherence_patterns"],
          timestamp: new Date().toISOString(),
        });
        emitAdherenceUpdate({
          patientId,
          actorUserId: caregiverId,
          riskLevel: "STABLE",
          confirmationRate: 0.95,
          reasons: ["On time"],
          timestamp: new Date().toISOString(),
        });
        emitAlertCreated({
          alertId: "al-1",
          patientId,
          recipientId: caregiverId,
          type: "DOSE_MISSED",
          message: "Missed dose",
          status: "OPEN",
          timestamp: new Date().toISOString(),
        });
      }).not.toThrow();
    });

    it("emits dose.updated event to patient room when server is active", () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockIo = { to: mockTo } as unknown as Server;

      setRealtimeServerForTesting(mockIo);

      emitDoseUpdate({ doseId: "d1", patientId, status: "TAKEN" });

      expect(mockTo).toHaveBeenCalledWith(`patient:${patientId}`);
      expect(mockEmit).toHaveBeenCalledWith(
        "dose.updated",
        expect.objectContaining({ doseId: "d1", patientId, status: "TAKEN" }),
      );
    });

    it("emits agent.insight event to patient room for real-time dashboard updates", () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockIo = { to: mockTo } as unknown as Server;

      setRealtimeServerForTesting(mockIo);

      emitAgentInsight({
        patientId,
        actorUserId: caregiverId,
        query: "How is evening adherence?",
        response: "Elevated risk 78%",
        safeguardTriggered: false,
        toolsInvoked: ["detect_adherence_patterns"],
        timestamp: "2026-10-25T16:00:00Z",
      });

      expect(mockTo).toHaveBeenCalledWith(`patient:${patientId}`);
      expect(mockEmit).toHaveBeenCalledWith(
        "agent.insight",
        expect.objectContaining({
          patientId,
          response: "Elevated risk 78%",
          safeguardTriggered: false,
        }),
      );
    });

    it("emits adherence.updated event to patient room when report is generated", () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockIo = { to: mockTo } as unknown as Server;

      setRealtimeServerForTesting(mockIo);

      emitAdherenceUpdate({
        patientId,
        actorUserId: caregiverId,
        riskLevel: "HIGH_RISK",
        confirmationRate: 0.78,
        reasons: ["3 unconfirmed evening doses"],
        suggestedFollowUp: "Check evening routine",
        summaryText: "Adherence is below threshold",
        timestamp: "2026-10-25T16:00:00Z",
      });

      expect(mockTo).toHaveBeenCalledWith(`patient:${patientId}`);
      expect(mockEmit).toHaveBeenCalledWith(
        "adherence.updated",
        expect.objectContaining({
          patientId,
          riskLevel: "HIGH_RISK",
          confirmationRate: 0.78,
        }),
      );
    });

    it("emits alert.created event to both patient room and caregiver user room", () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockIo = { to: mockTo } as unknown as Server;

      setRealtimeServerForTesting(mockIo);

      emitAlertCreated({
        alertId: "al-100",
        patientId,
        recipientId: caregiverId,
        type: "REPEATED_MISSES",
        message: "Patient missed 2 consecutive doses",
        status: "OPEN",
        timestamp: "2026-10-25T16:00:00Z",
      });

      expect(mockTo).toHaveBeenCalledWith(`patient:${patientId}`);
      expect(mockTo).toHaveBeenCalledWith(`user:${caregiverId}`);
      expect(mockEmit).toHaveBeenCalledTimes(2);
      expect(mockEmit).toHaveBeenCalledWith(
        "alert.created",
        expect.objectContaining({
          alertId: "al-100",
          type: "REPEATED_MISSES",
        }),
      );
    });
  });

  describe("Caregiver Access & Room Subscription Permissions", () => {
    it("subscribes active caregiver to patient room only when canViewSchedule is true", async () => {
      const httpServer = createServer();
      const io = initializeDoseRealtime(httpServer);

      const mockSocket = {
        data: { user: { id: caregiverId } },
        join: vi.fn(),
      } as unknown as Socket;

      mockPrisma.caregiverAccess.findMany.mockResolvedValueOnce([
        { patientId },
      ]);

      // Trigger connection handler
      const connectionHandler = io.listeners("connection")[0] as (socket: Socket) => Promise<void>;
      await connectionHandler(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith(`user:${caregiverId}`);
      expect(mockSocket.join).toHaveBeenCalledWith(`patient:${caregiverId}`);
      expect(mockSocket.join).toHaveBeenCalledWith(`patient:${patientId}`);

      expect(mockPrisma.caregiverAccess.findMany).toHaveBeenCalledWith({
        where: { caregiverId, status: "ACTIVE", canViewSchedule: true },
        select: { patientId: true },
      });

      await closeDoseRealtime();
    });

    it("does not subscribe caregiver when canViewSchedule is false or no active access", async () => {
      const httpServer = createServer();
      const io = initializeDoseRealtime(httpServer);

      const mockSocket = {
        data: { user: { id: caregiverId } },
        join: vi.fn(),
      } as unknown as Socket;

      // No active access with canViewSchedule returned
      mockPrisma.caregiverAccess.findMany.mockResolvedValueOnce([]);

      const connectionHandler = io.listeners("connection")[0] as (socket: Socket) => Promise<void>;
      await connectionHandler(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith(`user:${caregiverId}`);
      expect(mockSocket.join).toHaveBeenCalledWith(`patient:${caregiverId}`);
      expect(mockSocket.join).not.toHaveBeenCalledWith(`patient:${patientId}`);

      await closeDoseRealtime();
    });
  });
});
