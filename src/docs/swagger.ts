export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "NexPill Smart Medication Ecosystem API",
    version: "1.0.0",
    description:
      "Backend REST API for NexPill: A smart medication ecosystem designed to bridge prescription schedules, caregiver monitoring, and automated drug-drug interaction safety checks.",
    contact: {
      name: "NexPill Engineering Team",
    },
  },
  servers: [
    {
      url: "/",
      description: "Current Server Environment",
    },
  ],
  tags: [
    { name: "Health", description: "System liveness and operational health" },
    { name: "Auth", description: "Supabase authentication verification" },
    { name: "Medications", description: "Prescription and over-the-counter medication CRUD" },
    { name: "Schedules", description: "Dosage recurrence schedules and caregiver reminder rules" },
    { name: "Doses", description: "Medication adherence tracking (Taken, Skipped, Unable to Take) and scheduled dose lifecycle" },
    { name: "Notifications", description: "Reminder notifications dispatch and delivery endpoint tracking" },
    { name: "Alerts", description: "Caregiver escalation alerts and adherence monitoring" },
    { name: "Adherence", description: "AI-driven adherence analytics, pattern detection, and caregiver summaries" },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Supabase User JWT Bearer Token",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", example: "Invalid patientId: must be a valid UUID." },
          details: { type: "object", nullable: true },
        },
        required: ["error"],
      },
      SafetyWarning: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          kind: { type: "string", enum: ["INTERACTION", "DUPLICATE", "DOSE_LIMIT"], example: "INTERACTION" },
          severity: { type: "string", enum: ["INFO", "MODERATE", "SEVERE"], example: "SEVERE" },
          message: {
            type: "string",
            example: "Co-administration of Aspirin and Warfarin significantly increases the risk of major gastrointestinal bleeding.",
          },
          otherMedicationId: { type: "string", format: "uuid" },
          otherMedicationName: { type: "string", example: "Warfarin" },
          interactionId: { type: "string", format: "uuid", nullable: true },
        },
      },
      ReminderConfig: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          reminderOffsetsMin: {
            type: "array",
            items: { type: "integer" },
            example: [0, 15],
            description: "Minutes before dose scheduled time to alert patient",
          },
          lateAfterMin: { type: "integer", example: 15, description: "Minutes after scheduled time before dose is marked late" },
          caregiverAlertAfterMin: {
            type: "integer",
            example: 30,
            description: "Minutes after scheduled time before alerting caregiver",
          },
          missedAfterMin: {
            type: "integer",
            example: 120,
            description: "Minutes after scheduled time before marking dose missed",
          },
          notifyCaregivers: { type: "boolean", example: true },
        },
      },
      MedicationSchedule: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          medicationId: { type: "string", format: "uuid" },
          doseLabel: { type: "string", example: "Morning Dose" },
          timeZone: { type: "string", example: "America/New_York" },
          timesOfDay: {
            type: "array",
            items: { type: "string" },
            example: ["08:00", "20:00"],
            description: "24-hour HH:MM strings",
          },
          daysOfWeek: {
            type: "array",
            items: { type: "integer" },
            example: [1, 2, 3, 4, 5, 6, 7],
            description: "Days of week (1=Mon ... 7=Sun)",
          },
          startDate: { type: "string", format: "date", example: "2026-10-15" },
          endDate: { type: "string", format: "date", nullable: true },
          effectiveTo: { type: "string", format: "date-time", nullable: true },
          reminder: { $ref: "#/components/schemas/ReminderConfig" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Medication: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          patientId: { type: "string", format: "uuid" },
          catalogItemId: { type: "string", format: "uuid", nullable: true },
          name: { type: "string", example: "Metformin" },
          dosageText: { type: "string", example: "500mg" },
          form: { type: "string", example: "tablet", nullable: true },
          route: { type: "string", example: "oral", nullable: true },
          instructions: { type: "string", example: "Take twice daily with meals", nullable: true },
          prescriber: { type: "string", example: "Dr. Sarah Smith", nullable: true },
          startDate: { type: "string", format: "date", example: "2026-10-15", nullable: true },
          endDate: { type: "string", format: "date", nullable: true },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"], example: "ACTIVE" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          schedules: {
            type: "array",
            items: { $ref: "#/components/schemas/MedicationSchedule" },
          },
          warnings: {
            type: "array",
            items: { $ref: "#/components/schemas/SafetyWarning" },
          },
        },
      },
      CreateMedicationDto: {
        type: "object",
        required: ["name", "dosageText"],
        properties: {
          patientId: { type: "string", format: "uuid", description: "Target patient (defaults to authenticated user)" },
          catalogItemId: { type: "string", format: "uuid", description: "Reference to drug catalog for Conflict Engine checks" },
          name: { type: "string", example: "Lisinopril" },
          dosageText: { type: "string", example: "10mg" },
          form: { type: "string", example: "tablet" },
          route: { type: "string", example: "oral" },
          instructions: { type: "string", example: "Take once daily in the morning" },
          prescriber: { type: "string", example: "Dr. Adams" },
          startDate: { type: "string", format: "date", example: "2026-10-15" },
          endDate: { type: "string", format: "date", example: "2026-12-31" },
        },
      },
      UpdateMedicationDto: {
        type: "object",
        properties: {
          name: { type: "string", example: "Lisinopril" },
          dosageText: { type: "string", example: "20mg" },
          catalogItemId: { type: "string", format: "uuid", nullable: true },
          form: { type: "string", example: "tablet" },
          route: { type: "string", example: "oral" },
          instructions: { type: "string", example: "Take with water" },
          prescriber: { type: "string", example: "Dr. Adams" },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date", nullable: true },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
        },
      },
      CreateScheduleDto: {
        type: "object",
        required: ["doseLabel", "timesOfDay", "daysOfWeek", "startDate"],
        properties: {
          doseLabel: { type: "string", example: "Morning Dose" },
          timeZone: { type: "string", example: "America/New_York", default: "UTC" },
          timesOfDay: {
            type: "array",
            items: { type: "string" },
            example: ["08:00"],
            description: "24-hour HH:MM format",
          },
          daysOfWeek: {
            type: "array",
            items: { type: "integer" },
            example: [1, 2, 3, 4, 5, 6, 7],
            description: "Integers 0 to 7 (1=Monday ... 7=Sunday)",
          },
          startDate: { type: "string", format: "date", example: "2026-10-15" },
          endDate: { type: "string", format: "date", example: "2027-01-01" },
          reminder: {
            type: "object",
            properties: {
              reminderOffsetsMin: { type: "array", items: { type: "integer" }, example: [0, 15] },
              lateAfterMin: { type: "integer", example: 15 },
              caregiverAlertAfterMin: { type: "integer", example: 30 },
              missedAfterMin: { type: "integer", example: 120 },
              notifyCaregivers: { type: "boolean", example: true },
            },
          },
        },
      },
      UpdateScheduleDto: {
        type: "object",
        properties: {
          doseLabel: { type: "string", example: "Updated Dose Label" },
          timeZone: { type: "string", example: "America/New_York" },
          timesOfDay: { type: "array", items: { type: "string" }, example: ["09:00"] },
          daysOfWeek: { type: "array", items: { type: "integer" }, example: [1, 2, 3, 4, 5] },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date", nullable: true },
          reminder: {
            type: "object",
            properties: {
              lateAfterMin: { type: "integer" },
              caregiverAlertAfterMin: { type: "integer" },
              notifyCaregivers: { type: "boolean" },
            },
          },
        },
      },
      DoseEvent: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          doseId: { type: "string", format: "uuid" },
          fromStatus: { type: "string", enum: ["PENDING", "TAKEN", "SKIPPED", "UNABLE_TO_TAKE", "MISSED", "CANCELLED"] },
          toStatus: { type: "string", enum: ["PENDING", "TAKEN", "SKIPPED", "UNABLE_TO_TAKE", "MISSED", "CANCELLED"] },
          source: { type: "string", enum: ["PATIENT", "CAREGIVER", "DEVICE", "SYSTEM"] },
          actorUserId: { type: "string", format: "uuid", nullable: true },
          occurredAt: { type: "string", format: "date-time" },
          recordedAt: { type: "string", format: "date-time" },
          idempotencyKey: { type: "string" },
          note: { type: "string", nullable: true },
        },
      },
      ScheduledDose: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          scheduleId: { type: "string", format: "uuid" },
          patientId: { type: "string", format: "uuid" },
          scheduledAt: { type: "string", format: "date-time" },
          localDate: { type: "string", format: "date" },
          timeZone: { type: "string" },
          lateAfterAt: { type: "string", format: "date-time" },
          missedDeadlineAt: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["PENDING", "TAKEN", "SKIPPED", "UNABLE_TO_TAKE", "MISSED", "CANCELLED"], example: "PENDING" },
          version: { type: "integer" },
          resolvedAt: { type: "string", format: "date-time", nullable: true },
          resolvedSource: { type: "string", enum: ["PATIENT", "CAREGIVER", "DEVICE", "SYSTEM"], nullable: true },
          schedule: { $ref: "#/components/schemas/MedicationSchedule" },
          events: { type: "array", items: { $ref: "#/components/schemas/DoseEvent" } },
        },
      },
      RecordDoseDto: {
        type: "object",
        properties: {
          occurredAt: { type: "string", format: "date-time", example: "2026-10-16T08:05:00.000Z" },
          note: { type: "string", example: "Taken with breakfast" },
          idempotencyKey: { type: "string", example: "client-idemp-12345" },
        },
      },
      GenerateDosesDto: {
        type: "object",
        required: ["scheduleId", "startDate", "endDate"],
        properties: {
          scheduleId: { type: "string", format: "uuid" },
          startDate: { type: "string", format: "date", example: "2026-10-16" },
          endDate: { type: "string", format: "date", example: "2026-10-23" },
        },
      },
      Notification: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          recipientId: { type: "string", format: "uuid" },
          patientId: { type: "string", format: "uuid" },
          doseId: { type: "string", format: "uuid", nullable: true },
          alertId: { type: "string", format: "uuid", nullable: true },
          kind: {
            type: "string",
            enum: ["DOSE_REMINDER", "DOSE_REMINDER_FOLLOWUP", "CAREGIVER_ALERT", "SAFETY_WARNING", "DAILY_SUMMARY"],
            example: "DOSE_REMINDER",
          },
          channel: {
            type: "string",
            enum: ["IN_APP", "PUSH", "EMAIL", "SMS"],
            example: "PUSH",
          },
          status: {
            type: "string",
            enum: ["SCHEDULED", "SENDING", "SENT", "DELIVERED", "FAILED", "CANCELLED"],
            example: "SCHEDULED",
          },
          scheduledFor: { type: "string", format: "date-time" },
          sentAt: { type: "string", format: "date-time", nullable: true },
          deliveredAt: { type: "string", format: "date-time", nullable: true },
          attemptCount: { type: "integer" },
          dedupeKey: { type: "string" },
        },
      },
      CaregiverAlert: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          patientId: { type: "string", format: "uuid" },
          recipientId: { type: "string", format: "uuid" },
          doseId: { type: "string", format: "uuid", nullable: true },
          type: {
            type: "string",
            enum: ["DOSE_LATE", "DOSE_MISSED", "REPEATED_MISSES", "RISK_HIGH", "SAFETY_WARNING"],
            example: "DOSE_MISSED",
          },
          status: {
            type: "string",
            enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED"],
            example: "OPEN",
          },
          message: { type: "string", example: "Missed dose: Lisinopril scheduled for 08:00 was not confirmed." },
          reason: { type: "object" },
          createdAt: { type: "string", format: "date-time" },
          acknowledgedAt: { type: "string", format: "date-time", nullable: true },
          resolvedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
            AdherenceAnalysis: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          patientId: { type: "string", format: "uuid" },
          kind: {
            type: "string",
            enum: ["RISK_ASSESSMENT", "DAILY_SUMMARY", "REMINDER_TIMING_SUGGESTION"],
            example: "DAILY_SUMMARY",
          },
          periodStart: { type: "string", format: "date-time" },
          periodEnd: { type: "string", format: "date-time" },
          riskLevel: {
            type: "string",
            enum: ["STABLE", "NEEDS_ATTENTION", "HIGH_RISK"],
            nullable: true,
            example: "NEEDS_ATTENTION",
          },
          metrics: { type: "object" },
          reasons: { type: "object", nullable: true },
          summaryText: { type: "string", nullable: true },
          generator: {
            type: "string",
            enum: ["RULES", "AI_MODEL"],
            example: "AI_MODEL",
          },
          modelName: { type: "string", nullable: true, example: "nexpill-adherence-ml-v1" },
          promptVersion: { type: "string", nullable: true, example: "1.0" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      NotificationEndpoint: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          channel: { type: "string", enum: ["IN_APP", "PUSH", "EMAIL", "SMS"] },
          address: { type: "string" },
          enabled: { type: "boolean" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "API Health Check",
        description: "Returns the operational health status of the API.",
        responses: {
          200: {
            description: "Service is operational",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", example: "ok" } },
                },
              },
            },
          },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current Authenticated User Profile",
        description: "Validates the Supabase Bearer token and returns the caller's identity.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Authenticated user details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string", format: "uuid" },
                    email: { type: "string", format: "email" },
                  },
                },
              },
            },
          },
          401: {
            description: "Missing or invalid token",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/medications": {
      get: {
        tags: ["Medications"],
        summary: "List Medications",
        description: "Returns medications for the caller or a managed patient. Enforces caregiver permissions.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "patientId",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Target patient UUID (caregiver access required if different from caller)",
          },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["ACTIVE", "INACTIVE", "ALL"], default: "ACTIVE" },
            description: "Filter by medication status",
          },
          {
            name: "includeSchedules",
            in: "query",
            schema: { type: "boolean", default: false },
            description: "Include active schedules and reminder configurations",
          },
        ],
        responses: {
          200: {
            description: "Array of medications",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    medications: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Medication" },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        tags: ["Medications"],
        summary: "Create Medication",
        description: "Creates a new medication record and automatically runs Conflict Engine interaction checks.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateMedicationDto" },
            },
          },
        },
        responses: {
          201: {
            description: "Medication created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    medication: { $ref: "#/components/schemas/Medication" },
                    warnings: {
                      type: "array",
                      items: { $ref: "#/components/schemas/SafetyWarning" },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Validation Error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          403: { description: "Forbidden (Caregiver lacks canManageMedications)", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/medications/{id}": {
      get: {
        tags: ["Medications"],
        summary: "Get Medication by ID",
        description: "Fetches full details including active schedules and safety warnings.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Medication details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { medication: { $ref: "#/components/schemas/Medication" } },
                },
              },
            },
          },
          404: { description: "Medication not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      put: {
        tags: ["Medications"],
        summary: "Full Update Medication",
        description: "Updates medication and re-analyzes drug conflict interactions.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateMedicationDto" } } },
        },
        responses: {
          200: {
            description: "Updated medication and warnings",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    medication: { $ref: "#/components/schemas/Medication" },
                    warnings: { type: "array", items: { $ref: "#/components/schemas/SafetyWarning" } },
                  },
                },
              },
            },
          },
        },
      },
      patch: {
        tags: ["Medications"],
        summary: "Partial Update Medication",
        description: "Partially updates medication fields.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateMedicationDto" } } },
        },
        responses: {
          200: {
            description: "Updated medication and warnings",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    medication: { $ref: "#/components/schemas/Medication" },
                    warnings: { type: "array", items: { $ref: "#/components/schemas/SafetyWarning" } },
                  },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Medications"],
        summary: "Deactivate or Delete Medication",
        description: "By default soft-deactivates (status=INACTIVE). Pass ?hard=true to permanently remove.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "hard", in: "query", schema: { type: "boolean", default: false }, description: "Permanent deletion" },
        ],
        responses: {
          200: {
            description: "Deactivation result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    medication: { $ref: "#/components/schemas/Medication" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/medications/{medicationId}/schedules": {
      post: {
        tags: ["Schedules"],
        summary: "Create Schedule for Medication",
        description: "Defines recurrence times, days of week, and notification rules.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "medicationId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateScheduleDto" } } },
        },
        responses: {
          201: {
            description: "Schedule created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { schedule: { $ref: "#/components/schemas/MedicationSchedule" } },
                },
              },
            },
          },
          400: { description: "Invalid times or days", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          404: { description: "Medication not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      get: {
        tags: ["Schedules"],
        summary: "List Schedules for Medication",
        description: "Lists active dosage schedules and reminder rules for a specific medication.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "medicationId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Array of schedules",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    schedules: { type: "array", items: { $ref: "#/components/schemas/MedicationSchedule" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/schedules/{id}": {
      get: {
        tags: ["Schedules"],
        summary: "Get Schedule by ID",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Schedule details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { schedule: { $ref: "#/components/schemas/MedicationSchedule" } },
                },
              },
            },
          },
          404: { description: "Schedule not found" },
        },
      },
      patch: {
        tags: ["Schedules"],
        summary: "Update Schedule",
        description: "Updates times, days, or reminder thresholds.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateScheduleDto" } } },
        },
        responses: {
          200: {
            description: "Updated schedule",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { schedule: { $ref: "#/components/schemas/MedicationSchedule" } },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Schedules"],
        summary: "Deactivate Schedule",
        description: "Deactivates schedule by setting effectiveTo to now.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Deactivated schedule",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    schedule: { $ref: "#/components/schemas/MedicationSchedule" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/doses/{id}/taken": {
      post: {
        tags: ["Doses"],
        summary: "Record Dose as Taken",
        description: "Transitions dose status to TAKEN and logs an immutable audit event.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RecordDoseDto" },
            },
          },
        },
        responses: {
          200: {
            description: "Dose marked as taken",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    dose: { $ref: "#/components/schemas/ScheduledDose" },
                    event: { $ref: "#/components/schemas/DoseEvent" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/doses/{id}/skipped": {
      post: {
        tags: ["Doses"],
        summary: "Record Dose as Skipped",
        description: "Transitions dose status to SKIPPED with an optional clinical or user reason.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RecordDoseDto" },
            },
          },
        },
        responses: {
          200: {
            description: "Dose marked as skipped",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    dose: { $ref: "#/components/schemas/ScheduledDose" },
                    event: { $ref: "#/components/schemas/DoseEvent" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/doses/{id}/unable-to-take": {
      post: {
        tags: ["Doses"],
        summary: "Record Dose as Unable to Take",
        description: "Transitions dose status to UNABLE_TO_TAKE (e.g. vomiting, acute side effects) with optional notes.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RecordDoseDto" },
            },
          },
        },
        responses: {
          200: {
            description: "Dose marked as unable to take",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    dose: { $ref: "#/components/schemas/ScheduledDose" },
                    event: { $ref: "#/components/schemas/DoseEvent" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/doses/{id}": {
      get: {
        tags: ["Doses"],
        summary: "Get Dose by ID",
        description: "Retrieves scheduled dose details with schedule, medication, and full event audit trail.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Scheduled dose details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    dose: { $ref: "#/components/schemas/ScheduledDose" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/doses": {
      get: {
        tags: ["Doses"],
        summary: "List Scheduled Doses",
        description: "Lists scheduled doses for the patient with filters by status, dates, and medication.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "patientId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "startDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "medicationId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "scheduleId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "List of scheduled doses",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    doses: { type: "array", items: { $ref: "#/components/schemas/ScheduledDose" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/doses/generate": {
      post: {
        tags: ["Doses"],
        summary: "Generate Doses from Schedule",
        description: "Generates pending ScheduledDose records for a schedule across a date range.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GenerateDosesDto" },
            },
          },
        },
        responses: {
          201: {
            description: "Generated doses",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    count: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/doses/jobs/detect-missed": {
      post: {
        tags: ["Doses"],
        summary: "Trigger Missed Doses Detection Job",
        description: "Scans for overdue pending doses past their missedDeadlineAt, transitions them to MISSED, and creates caregiver alerts.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  referenceTime: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Job execution report",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    result: {
                      type: "object",
                      properties: {
                        runAt: { type: "string", format: "date-time" },
                        missedCount: { type: "integer" },
                        processedDoseIds: { type: "array", items: { type: "string" } },
                        alertsCreatedCount: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/caregiver-access/invites": {
      post: {
        tags: ["Caregiver Access"],
        summary: "Create a caregiver invitation",
        description: "Creates a single-use invitation token that expires after seven days.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  canViewSchedule: { type: "boolean", default: true },
                  canViewHistory: { type: "boolean", default: true },
                  canReceiveAlerts: { type: "boolean", default: true },
                  canRecordDoses: { type: "boolean", default: false },
                  canManageMedications: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Invitation created. The token is returned only in this response.",
          },
        },
      },
    },
    "/caregiver-access/invites/accept": {
      post: {
        tags: ["Caregiver Access"],
        summary: "Accept a caregiver invitation",
        description: "Links the authenticated Supabase user to the patient represented by the invitation.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: {
                  token: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Invitation accepted." },
          404: { description: "Invitation not found or expired." },
        },
      },
    },
    "/caregiver-access": {
      get: {
        tags: ["Caregiver Access"],
        summary: "List caregiver relationships",
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: "Relationships for the authenticated user." },
        },
      },
    },
    "/caregiver-access/{patientId}/daily-summary": {
      get: {
        tags: ["Caregiver Access"],
        summary: "Get a patient's daily dose summary",
        description: "Counts non-cancelled scheduled doses for the patient's local calendar date. Caregivers must have active schedule-view permission.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "patientId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "date",
            in: "query",
            required: true,
            description: "Patient-local calendar date.",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: {
          200: {
            description: "Daily dose totals.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    summary: {
                      type: "object",
                      required: ["date", "scheduled", "taken", "skipped", "missed"],
                      properties: {
                        date: { type: "string", format: "date" },
                        scheduled: { type: "integer", minimum: 0 },
                        taken: { type: "integer", minimum: 0 },
                        skipped: { type: "integer", minimum: 0 },
                        missed: { type: "integer", minimum: 0 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "List Notifications",
        description: "Lists notifications for the authenticated recipient with filters for status, kind, channel, and dates.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "kind", in: "query", schema: { type: "string" } },
          { name: "channel", in: "query", schema: { type: "string" } },
          { name: "doseId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "startDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: {
          200: {
            description: "List of notifications",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    notifications: { type: "array", items: { $ref: "#/components/schemas/Notification" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/notifications/{id}/delivered": {
      patch: {
        tags: ["Notifications"],
        summary: "Mark Notification as Delivered",
        description: "Confirms delivery/reading of a notification by the recipient.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Updated notification",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { notification: { $ref: "#/components/schemas/Notification" } },
                },
              },
            },
          },
        },
      },
    },
    "/notifications/jobs/dispatch": {
      post: {
        tags: ["Notifications"],
        summary: "Trigger Notification Dispatch Worker",
        description: "Scans for SCHEDULED notifications due for delivery and transitions them to DELIVERED.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { referenceTime: { type: "string", format: "date-time" } },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Dispatch results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    result: {
                      type: "object",
                      properties: {
                        runAt: { type: "string", format: "date-time" },
                        processedCount: { type: "integer" },
                        deliveredCount: { type: "integer" },
                        cancelledCount: { type: "integer" },
                        failedCount: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/notifications/doses/{doseId}/schedule": {
      post: {
        tags: ["Notifications"],
        summary: "Schedule Reminders for a Dose",
        description: "Generates pending reminder notifications for a dose based on schedule rules with deduplication.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "doseId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          201: {
            description: "Scheduled reminders",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    scheduledCount: { type: "integer" },
                    notificationIds: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/alerts": {
      get: {
        tags: ["Alerts"],
        summary: "List Caregiver Alerts",
        description: "Lists alerts for the authenticated caregiver or patient, filterable by status, type, and dates.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "patientId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED"] } },
          { name: "type", in: "query", schema: { type: "string", enum: ["DOSE_LATE", "DOSE_MISSED", "REPEATED_MISSES", "RISK_HIGH", "SAFETY_WARNING"] } },
          { name: "startDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: {
          200: {
            description: "List of caregiver alerts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    alerts: { type: "array", items: { $ref: "#/components/schemas/CaregiverAlert" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/alerts/summary": {
      get: {
        tags: ["Alerts"],
        summary: "Caregiver Alerts Summary",
        description: "Returns count aggregates of alerts grouped by status and type.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "patientId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Alerts summary counts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    summary: {
                      type: "object",
                      properties: {
                        total: { type: "integer" },
                        open: { type: "integer" },
                        acknowledged: { type: "integer" },
                        resolved: { type: "integer" },
                        byType: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/alerts/{id}": {
      get: {
        tags: ["Alerts"],
        summary: "Get Alert by ID",
        description: "Retrieves details of a single caregiver alert.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Caregiver alert details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { alert: { $ref: "#/components/schemas/CaregiverAlert" } },
                },
              },
            },
          },
        },
      },
    },
    "/alerts/{id}/acknowledge": {
      patch: {
        tags: ["Alerts"],
        summary: "Acknowledge Caregiver Alert",
        description: "Transitions alert status from OPEN to ACKNOWLEDGED.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Acknowledged alert",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { alert: { $ref: "#/components/schemas/CaregiverAlert" } },
                },
              },
            },
          },
        },
      },
    },
    "/alerts/{id}/resolve": {
      patch: {
        tags: ["Alerts"],
        summary: "Resolve Caregiver Alert",
        description: "Transitions alert status to RESOLVED.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Resolved alert",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { alert: { $ref: "#/components/schemas/CaregiverAlert" } },
                },
              },
            },
          },
        },
      },
    },
    "/notifications/endpoints": {
      get: {
        tags: ["Notifications"],
        summary: "List Registered Endpoints",
        description: "Retrieves delivery channels (PUSH, EMAIL, SMS, IN_APP) registered for the user.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "List of endpoints",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    endpoints: { type: "array", items: { $ref: "#/components/schemas/NotificationEndpoint" } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Notifications"],
        summary: "Register Notification Endpoint",
        description: "Registers or enables a delivery address or device token for a channel.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["channel", "address"],
                properties: {
                  channel: { type: "string", enum: ["IN_APP", "PUSH", "EMAIL", "SMS"] },
                  address: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Registered endpoint",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { endpoint: { $ref: "#/components/schemas/NotificationEndpoint" } },
                },
              },
            },
          },
        },
      },
    },
    "/adherence/{patientId}/summary": {
      get: {
        tags: ["Adherence"],
        summary: "Get Patient Adherence Summary",
        description:
          "Retrieves the latest generated adherence summary and risk level for a patient. Generates a 7-day summary on the fly if none exists.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "patientId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Target patient UUID",
          },
        ],
        responses: {
          200: {
            description: "Adherence analysis summary",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    analysis: { $ref: "#/components/schemas/AdherenceAnalysis" },
                  },
                },
              },
            },
          },
          401: {
            description: "Missing or invalid authentication token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          403: {
            description: "Forbidden: Actor lacks authorization to view this patient",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          404: {
            description: "Patient not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/adherence/{patientId}/analyze": {
      post: {
        tags: ["Adherence"],
        summary: "Generate Adherence Analysis & Pattern Detection",
        description:
          "Computes deterministic adherence metrics, detects missed/delayed dose patterns and time-of-day friction, and persists an explainable report.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "patientId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Target patient UUID",
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  periodStart: { type: "string", format: "date-time" },
                  periodEnd: { type: "string", format: "date-time" },
                  kind: {
                    type: "string",
                    enum: ["RISK_ASSESSMENT", "DAILY_SUMMARY", "REMINDER_TIMING_SUGGESTION"],
                  },
                  generator: {
                    type: "string",
                    enum: ["RULES", "AI_MODEL"],
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Generated structured adherence report",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    report: {
                      type: "object",
                      properties: {
                        patientId: { type: "string", format: "uuid" },
                        period: {
                          type: "object",
                          properties: {
                            start: { type: "string", format: "date-time" },
                            end: { type: "string", format: "date-time" },
                          },
                        },
                        metrics: { type: "object" },
                        patterns: { type: "array", items: { type: "object" } },
                        riskAssessment: {
                          type: "object",
                          properties: {
                            level: { type: "string", enum: ["STABLE", "NEEDS_ATTENTION", "HIGH_RISK"] },
                            score: { type: "number" },
                            reasons: { type: "array", items: { type: "string" } },
                          },
                        },
                        suggestedFollowUp: { type: "string" },
                        summaryText: { type: "string" },
                        analysisRecordId: { type: "string", format: "uuid" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: "Invalid input or date range",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          401: {
            description: "Missing or invalid authentication token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          403: {
            description: "Forbidden: Actor lacks authorization to analyze this patient",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
};