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
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "API Health Check",
        description: "Returns operational health status. Used by Render and load balancers.",
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
  },
};
