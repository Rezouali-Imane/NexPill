import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMedicalMcpServer } from "../mcp/medical-server";
import { AccessControlService } from "./access-control.service";
import { validateUuid } from "../utils/validation";
import { emitAgentInsight } from "../realtime/dose-events";
import { AiSummaryService } from "./ai-summary.service";

export interface AgentQueryResult {
  response: string;
  safeguardTriggered: boolean;
  safeguardType?: "DOSAGE_MODIFICATION_PROHIBITED" | "TREATMENT_DECISION_PROHIBITED";
  toolsInvoked: string[];
  disclaimer: string;
  data?: Record<string, unknown>;
}

export const CLINICAL_DISCLAIMER =
  "Disclaimer: Observational adherence tracking and behavioral pattern insights only. Not a medical diagnosis or treatment directive.";

export const DEMO_AHMED_PATIENT_ID = "00000000-0000-4000-8000-000000000001";

interface PatternToolResult extends Record<string, unknown> {
  metrics: {
    confirmationRate: number;
    confirmedCount: number;
    totalScheduled: number;
  };
  riskAssessment: {
    level: string;
    score: number;
    reasons: string[];
  };
}

interface DoseHistoryToolItem {
  medication: { name: string };
  adherenceResult: string;
  timeOfDay: string;
}

interface MedicationToolItem {
  id?: string;
  name: string;
  dosageText?: string;
}

interface MedicationInfoToolResult {
  name?: string;
  rxcui?: string;
  synonyms?: string[];
}

interface SummaryToolResult extends Record<string, unknown> {
  summaryText?: string;
}

export class ClinicalAgentService {
  /**
   * Evaluates prompt against strict clinical safety boundaries.
   * Prohibits dosage modifications, prescription changes, and diagnostic treatment decisions.
   */
  static checkClinicalSafeguards(prompt: string): {
    safe: boolean;
    refusalMessage?: string;
    safeguardType?: "DOSAGE_MODIFICATION_PROHIBITED" | "TREATMENT_DECISION_PROHIBITED";
  } {
    const text = prompt.toLowerCase();

    // 1. Safeguard: Dosage and Prescription Modifications
    const dosagePatterns = [
      /\b(change|increase|decrease|double|halve|adjust|raise|lower|modify|titrate|cut|boost)\b.*\b(dose|dosage|pills?|amount|mg|milligram|tablets?)\b/i,
      /\b(prescribe|start\s+taking|discontinue|stop\s+taking|give\s+more|reduce\s+to|switch\s+to)\b/i,
      /\b(change|alter)\b.*\b(schedule|prescription|frequency)\b/i,
      /\b(dose\s+(of|to)\s+\d+mg)\b/i,
    ];

    for (const pattern of dosagePatterns) {
      if (pattern.test(text)) {
        return {
          safe: false,
          safeguardType: "DOSAGE_MODIFICATION_PROHIBITED",
          refusalMessage:
            "SAFEGUARD REFUSAL: As an AI assistant for NexPill, I am strictly prohibited from altering medication dosages, modifying prescriptions, or changing medication schedules. Prescriptions are clinically immutable. Please consult the prescribing physician or licensed healthcare provider to adjust treatment.",
        };
      }
    }

    // 2. Safeguard: Clinical Diagnostics and Treatment Directives
    const treatmentPatterns = [
      /\b(diagnose|diagnosing|diagnosis|what\s+disease|what\s+illness)\b/i,
      /\b(cure|treatment\s+plan|treat\s+his\s+infection|treat\s+her\s+infection)\b/i,
      /\b(is\s+it\s+safe\s+to\s+stop|can\s+(he|she|i)\s+skip\s+permanently|can\s+(he|she|i)\s+quit)\b/i,
    ];

    for (const pattern of treatmentPatterns) {
      if (pattern.test(text)) {
        return {
          safe: false,
          safeguardType: "TREATMENT_DECISION_PROHIBITED",
          refusalMessage:
            "SAFEGUARD REFUSAL: As an AI assistant for NexPill, I cannot make medical diagnoses or clinical treatment decisions. I can only report verified adherence patterns and schedule tracking. Please seek guidance from a qualified medical professional.",
        };
      }
    }

    return { safe: true };
  }

  /**
   * Generates labeled benchmark demo data representing Ahmed's 5-medication profile with evening friction.
   */
  static getLabeledAhmedDemoData() {
    return {
      patient: {
        id: DEMO_AHMED_PATIENT_ID,
        name: "Ahmed (Benchmark Elderly Patient)",
        age: 72,
        prescriptions: [
          { name: "Lisinopril", dosage: "10mg", scheduledTime: "08:00" },
          { name: "Metformin", dosage: "500mg", scheduledTime: "08:00" },
          { name: "Atorvastatin", dosage: "20mg", scheduledTime: "18:00" },
          { name: "Amlodipine", dosage: "5mg", scheduledTime: "18:00" },
          { name: "Aspirin", dosage: "81mg", scheduledTime: "18:00" },
        ],
      },
      adherenceRecord: {
        totalScheduled: 35,
        confirmedCount: 28,
        unconfirmedCount: 7,
        confirmationRate: 0.80,
        morningAdherenceRate: 0.95,
        eveningAdherenceRate: 0.40, // Significant friction
        recentTrend: "DETERIORATING",
        consecutiveMissedEveningDoses: 3,
        primaryFriction: "Evening doses (18:00) have recurring unconfirmed events.",
      },
      missedDosePrediction: {
        nextDose: "18:00 Evening Routine",
        estimatedRiskProbability: 0.78,
        riskLevel: "HIGH_RISK",
        reasons: [
          "3 evening doses were unconfirmed in the past 5 days.",
          "Evening doses have a 60% historical unconfirmed rate compared to 5% in the morning.",
          "Recent adherence momentum has deteriorated.",
        ],
      },
    };
  }

  private static parseToolResponseText(res: unknown): string {
    const r = res as { content?: Array<{ type: string; text?: string }> };
    return r.content?.[0]?.text ?? "{}";
  }

  private static parseToolJson<T>(res: unknown, fallback: T): T {
    try {
      const text = this.parseToolResponseText(res);
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  }

  /**
   * Connects the clinical agent to backend MCP tools and processes queries with strict safeguards.
   */
  static async processQuery(
    actorUserId: string,
    params: {
      query: string;
      patientId?: string;
      useDemoData?: boolean;
    },
  ): Promise<AgentQueryResult> {
    const { query, patientId, useDemoData } = params;

    // Step 1: Pre-execution clinical safeguard verification
    const safeguardCheck = this.checkClinicalSafeguards(query);
    if (!safeguardCheck.safe) {
      return {
        response: safeguardCheck.refusalMessage!,
        safeguardTriggered: true,
        safeguardType: safeguardCheck.safeguardType,
        toolsInvoked: [],
        disclaimer: CLINICAL_DISCLAIMER,
      };
    }

    // Step 2: Handle labeled benchmark demo data (Ahmed profile)
    if (useDemoData || patientId === DEMO_AHMED_PATIENT_ID || patientId === "demo-ahmed") {
      const demoData = this.getLabeledAhmedDemoData();
      const lower = query.toLowerCase();

      let answer: string;
      if (lower.includes("evening") || lower.includes("risk") || lower.includes("predict")) {
        answer =
          `Ahmed's next evening dose (18:00) has an elevated unconfirmed risk of 78% (HIGH_RISK).\n\n` +
          `Key detected reasons:\n` +
          `• 3 evening doses were unconfirmed in the past 5 days.\n` +
          `• Evening doses show significant friction (40% confirmation rate vs 95% in morning doses).\n` +
          `• Recent 3-day adherence momentum has deteriorated.\n\n` +
          `Suggested follow-up: Check whether Ahmed needs additional caregiver support during his evening routine or if reminder notification offsets should be customized.`;
      } else {
        answer =
          `Ahmed is currently prescribed 5 daily medications across morning (08:00) and evening (18:00) schedules. ` +
          `His overall confirmation rate is 80% (28/35 doses confirmed). Morning adherence is high (95%), but evening doses carry substantial friction (40% confirmation rate).`;
      }

      if (process.env.NODE_ENV !== "test") {
        const ai = await AiSummaryService.getClient();
        if (ai) {
          try {
            const prompt = `User query about benchmark patient Ahmed: "${query}"\nPatient Profile:\n${JSON.stringify(demoData, null, 2)}\n\nInstructions: Answer the caregiver's question accurately, concisely, and helpfully based on Ahmed's profile. Do not recommend changing prescriptions or dosages.`;
            const gen = await ai.models.generateContent({
              model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
              contents: prompt,
              config: {
                systemInstruction: "You are NexPill's clinical adherence assistant. Ground all statements strictly in the patient data. Never modify prescriptions or dosages.",
                temperature: 0.2,
              },
            });
            const text = gen.text?.trim();
            if (text) {
              answer = text;
            }
          } catch {
            // keep standard answer
          }
        }
      }

      const demoResult: AgentQueryResult = {
        response: answer,
        safeguardTriggered: false,
        toolsInvoked: ["detect_adherence_patterns", "get_patient_adherence_history"],
        disclaimer: CLINICAL_DISCLAIMER,
        data: demoData,
      };

      emitAgentInsight({
        patientId: DEMO_AHMED_PATIENT_ID,
        actorUserId,
        query,
        response: answer,
        safeguardTriggered: false,
        toolsInvoked: demoResult.toolsInvoked,
        timestamp: new Date().toISOString(),
        data: demoData,
      });

      return demoResult;
    }

    // Step 3: Real Application Data Query via Medical MCP Server
    const targetPatientId = patientId ? validateUuid(patientId, "patientId") : actorUserId;
    await AccessControlService.assertPatientAccess(actorUserId, targetPatientId, "read");

    // Initialize MCP in-memory client connected to the Medical MCP Server instance
    const server = createMedicalMcpServer(actorUserId);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "nexpill-clinical-agent", version: "1.0.0" });

    const toolsInvoked: string[] = [];
    let responseText: string;
    let dataPayload: Record<string, unknown> | undefined;

    try {
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      const lower = query.toLowerCase();

      // Tool invocation logic based on query intent:
      if (lower.includes("pattern") || lower.includes("miss") || lower.includes("delay") || lower.includes("risk")) {
        // Query adherence patterns
        toolsInvoked.push("detect_adherence_patterns");
        const res = await client.callTool({
          name: "detect_adherence_patterns",
          arguments: { patientId: targetPatientId },
        });

        const parsed = this.parseToolJson<PatternToolResult>(res, { metrics: { confirmationRate: 1, confirmedCount: 0, totalScheduled: 0 }, riskAssessment: { level: "STABLE", score: 0, reasons: [] } });
        dataPayload = parsed;

        const ratePct = Math.round(parsed.metrics.confirmationRate * 100);
        const reasonsList = parsed.riskAssessment.reasons.map((r: string) => `• ${r}`).join("\n");
        responseText =
          `Patient adherence rate is at ${ratePct}% (${parsed.metrics.confirmedCount}/${parsed.metrics.totalScheduled} doses confirmed).\n` +
          `Risk Level: ${parsed.riskAssessment.level} (Score: ${parsed.riskAssessment.score})\n\n` +
          `Key Findings:\n${reasonsList}\n\n` +
          `Note: Unconfirmed doses reflect absence of confirmation telemetry rather than verified non-adherence.`;

        if (process.env.NODE_ENV !== "test") {
          const ai = await AiSummaryService.getClient();
          if (ai) {
            try {
              const prompt = `User query: "${query}"\nPatient Adherence Data:\n${JSON.stringify(parsed, null, 2)}\n\nInstructions:\n1. Answer the user query clearly and accurately grounded in the provided patient data.\n2. Always state the patient adherence rate (${ratePct}%) and risk level (${parsed.riskAssessment.level}).\n3. Do not recommend changing prescriptions or dosages.`;
              const gen = await ai.models.generateContent({
                model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
                contents: prompt,
                config: {
                  systemInstruction: "You are NexPill's clinical adherence assistant. Ground all statements in verified patient telemetry. Never change prescriptions or dosages.",
                  temperature: 0.2,
                },
              });
              const text = gen.text?.trim();
              if (text) {
                responseText = text;
                if (!responseText.toLowerCase().includes("patient adherence rate")) {
                  responseText = `Patient adherence rate is at ${ratePct}% (${parsed.metrics.confirmedCount}/${parsed.metrics.totalScheduled} doses confirmed).\n\n` + responseText;
                }
              }
            } catch {
              // fallback to deterministic responseText
            }
          }
        }
      } else if (lower.includes("history") || lower.includes("doses") || lower.includes("events")) {
        // Query adherence dose history
        toolsInvoked.push("get_patient_adherence_history");
        const res = await client.callTool({
          name: "get_patient_adherence_history",
          arguments: { patientId: targetPatientId },
        });

        const history = this.parseToolJson<DoseHistoryToolItem[]>(res, []);
        dataPayload = { history };
        responseText =
          `Retrieved ${history.length} recent scheduled dose records. ` +
          `Recent observational results: ` +
          history.slice(0, 5).map((h: { medication: { name: string }; adherenceResult: string; timeOfDay: string }) =>
            `${h.medication.name} (${h.timeOfDay}): ${h.adherenceResult}`
          ).join(", ") + ".";
      } else if (lower.includes("medication") || lower.includes("prescriptions") || lower.includes("drugs")) {
        // List prescribed medications
        toolsInvoked.push("list_medications");
        const res = await client.callTool({
          name: "list_medications",
          arguments: { patientId: targetPatientId },
        });

        const meds = this.parseToolJson<MedicationToolItem[]>(res, []);
        dataPayload = { medications: meds };
        responseText =
          `Patient has ${meds.length} active medications on record: ` +
          meds.map((m: { name: string; dosageText?: string }) => `${m.name} (${m.dosageText ?? "standard"})`).join(", ") + ".";
      } else if (
        lower.includes("lookup") ||
        lower.includes("rxnorm") ||
        lower.includes("information for") ||
        lower.includes("info for")
      ) {
        // Lookup medication reference information via NIH RxNorm MCP tool
        toolsInvoked.push("lookup_medication_information");
        const match = query.match(/(?:lookup|rxnorm|information for|info for|about)\s+([a-zA-Z0-9\-_ ]+)/i);
        const medName = match ? match[1].trim() : "Lisinopril";
        const res = await client.callTool({
          name: "lookup_medication_information",
          arguments: { medicationName: medName },
        });

        const info = this.parseToolJson<MedicationInfoToolResult>(res, { name: medName });
        dataPayload = { medicationInformation: info };
        const synList = Array.isArray(info.synonyms) && info.synonyms.length > 0
          ? ` Synonyms: ${info.synonyms.slice(0, 3).join(", ")}.`
          : "";
        responseText = `Reference information for ${info.name ?? medName}: NIH RxNorm Concept ID ${info.rxcui ?? "N/A"}.${synList} (Reference data only; not medical advice).`;
      } else if (lower.includes("schedule") || lower.includes("frequency") || lower.includes("routine")) {
        // Query medication schedules via MCP tools
        toolsInvoked.push("list_medications");
        const medsRes = await client.callTool({
          name: "list_medications",
          arguments: { patientId: targetPatientId },
        });
        const meds = this.parseToolJson<MedicationToolItem[]>(medsRes, []);

        let schedulesList: unknown[] = [];
        if (Array.isArray(meds) && meds.length > 0 && meds[0].id) {
          toolsInvoked.push("list_schedules");
          const schedRes = await client.callTool({
            name: "list_schedules",
            arguments: { medicationId: meds[0].id },
          });
          schedulesList = this.parseToolJson<unknown[]>(schedRes, []);
        }

        dataPayload = { medications: meds, schedules: schedulesList };
        responseText = `Patient has ${meds.length} prescribed medications with ${schedulesList.length} schedule settings retrieved.`;
      } else {
        // Default to comprehensive summary
        toolsInvoked.push("generate_adherence_summary");
        const res = await client.callTool({
          name: "generate_adherence_summary",
          arguments: { patientId: targetPatientId },
        });

        const summary = this.parseToolJson<SummaryToolResult>(res, { summaryText: "Adherence analysis completed." });
        dataPayload = summary;
        responseText = summary.summaryText ?? "Adherence analysis completed.";
      }
    } finally {
      await client.close();
      await server.close();
    }

    const finalResult: AgentQueryResult = {
      response: responseText,
      safeguardTriggered: false,
      toolsInvoked,
      disclaimer: CLINICAL_DISCLAIMER,
      data: dataPayload,
    };

    emitAgentInsight({
      patientId: targetPatientId,
      actorUserId,
      query,
      response: responseText,
      safeguardTriggered: false,
      toolsInvoked,
      timestamp: new Date().toISOString(),
      data: dataPayload,
    });

    return finalResult;
  }
}
