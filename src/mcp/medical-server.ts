import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { MedicationInformationService } from "../services/medication-information.service";
import { MedicationService } from "../services/medication.service";
import { ScheduleService } from "../services/schedule.service";
import { AdherenceAnalyticsService } from "../services/adherence-analytics.service";

export const createMedicalMcpServer = (userId: string): McpServer => {
  const server = new McpServer({
    name: "nexpill-medical",
    version: "1.0.0",
  });

  // 1. Reference Medication Lookup (NIH RxNorm)
  server.registerTool(
    "lookup_medication_information",
    {
      description:
        "Read-only medication name lookup against the public NIH RxNorm terminology service. This is reference data, not medical advice.",
      inputSchema: {
        medicationName: z.string().trim().min(1).max(200),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ medicationName }) => {
      const information = await MedicationInformationService.lookup(medicationName);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(information),
          },
        ],
      };
    },
  );

  // 2. List Authorized Patient Medications
  server.registerTool(
    "list_medications",
    {
      description:
        "List prescribed and over-the-counter medications for an authorized patient.",
      inputSchema: {
        patientId: z.string().uuid().optional(),
        status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).optional(),
        includeSchedules: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ patientId, status, includeSchedules }) => {
      const medications = await MedicationService.listMedications(userId, {
        patientId,
        status,
        includeSchedules,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(medications, null, 2),
          },
        ],
      };
    },
  );

  // 3. List Medication Schedules
  server.registerTool(
    "list_schedules",
    {
      description:
        "List recurrence schedules, times of day, and reminder settings for a medication.",
      inputSchema: {
        medicationId: z.string().uuid(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ medicationId }) => {
      const schedules = await ScheduleService.listSchedulesForMedication(userId, medicationId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(schedules, null, 2),
          },
        ],
      };
    },
  );

  // 4. Authorized Patient Dose Adherence History
  server.registerTool(
    "get_patient_adherence_history",
    {
      description:
        "Fetch authorized scheduled doses, observational adherence outcomes (ON_TIME, LATE, UNCONFIRMED, MISSED, SKIPPED), confirmation latency, and medication details within a date range.",
      inputSchema: {
        patientId: z.string().uuid().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ patientId, startDate, endDate }) => {
      const targetPatientId = patientId ?? userId;
      const history = await AdherenceAnalyticsService.getAdherenceHistory(
        userId,
        targetPatientId,
        {
          startDate,
          endDate,
        },
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(history, null, 2),
          },
        ],
      };
    },
  );

  // 5. Detect Adherence Patterns (Repeated Misses, Delays, Friction)
  server.registerTool(
    "detect_adherence_patterns",
    {
      description:
        "Analyzes patient dose history to detect repeated missed doses, recurring confirmation delays, time-of-day adherence friction, and trend trajectory.",
      inputSchema: {
        patientId: z.string().uuid().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ patientId, startDate, endDate }) => {
      const targetPatientId = patientId ?? userId;
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

      const { metrics, doses } = await AdherenceAnalyticsService.computeAdherenceMetrics(
        userId,
        targetPatientId,
        start,
        end,
      );

      const patternAnalysis = AdherenceAnalyticsService.detectPatterns(metrics, doses);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                patientId: targetPatientId,
                period: { start, end },
                metrics,
                ...patternAnalysis,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 6. Generate Structured Adherence Summary
  server.registerTool(
    "generate_adherence_summary",
    {
      description:
        "Generates an explainable, structured adherence summary report combining verified statistics, detected behavioral patterns, risk assessment, and actionable caregiver follow-up suggestions.",
      inputSchema: {
        patientId: z.string().uuid().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ patientId, startDate, endDate }) => {
      const targetPatientId = patientId ?? userId;
      const report = await AdherenceAnalyticsService.generateReport(userId, targetPatientId, {
        periodStart: startDate,
        periodEnd: endDate,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    },
  );

  return server;
};
