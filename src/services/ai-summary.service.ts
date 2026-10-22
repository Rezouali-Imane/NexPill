import type { RiskLevel } from "@prisma/client";
import type {
  AdherenceMetrics,
  AdherencePattern,
} from "./adherence-analytics.service";

export interface GoogleGenAIClient {
  models: {
    generateContent: (params: {
      model: string;
      contents: string;
      config?: {
        systemInstruction?: string;
        responseMimeType?: string;
        temperature?: number;
      };
    }) => Promise<{ text?: string | null }>;
  };
}

export interface SummaryGenerationResult {
  summaryText: string;
  suggestedFollowUp: string;
  generator: "AI_MODEL" | "RULES";
  modelName: string;
  promptVersion?: string;
}

export class AiSummaryService {
  private static client: GoogleGenAIClient | null = null;

  /**
   * Lazily loads the GoogleGenAI ESM package and returns initialized client if API key is provided, or null.
   */
  static async getClient(): Promise<GoogleGenAIClient | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      return null;
    }
    if (!this.client) {
      try {
        const dynamicImport = new Function("specifier", "return import(specifier)") as (
          s: string,
        ) => Promise<{ GoogleGenAI: new (opts: { apiKey: string }) => GoogleGenAIClient }>;
        const genAiModule = await dynamicImport("@google/genai");
        this.client = new genAiModule.GoogleGenAI({ apiKey });
      } catch {
        return null;
      }
    }
    return this.client;
  }

  /**
   * Allows injecting a mock client during automated unit tests.
   */
  static setClientForTesting(client: GoogleGenAIClient | null): void {
    this.client = client;
  }

  /**
   * Generates a grounded natural language summary and caregiver follow-up.
   * If GEMINI_API_KEY is configured, queries the Gemini LLM.
   * If no API key is provided or if the API call fails, falls back gracefully to deterministic rule-based output.
   */
  static async generateSummary(
    metrics: AdherenceMetrics,
    patterns: AdherencePattern[],
    riskLevel: RiskLevel,
    fallbackNarrative: { summaryText: string; suggestedFollowUp: string },
  ): Promise<SummaryGenerationResult> {
    const ai = await this.getClient();
    if (!ai) {
      return {
        summaryText: fallbackNarrative.summaryText,
        suggestedFollowUp: fallbackNarrative.suggestedFollowUp,
        generator: "RULES",
        modelName: "rules-deterministic-v1",
      };
    }

    try {
      const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const prompt = this.buildPrompt(metrics, patterns, riskLevel);

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction:
            "You are NexPill's clinical adherence assistant. You explain verified patient medication adherence statistics and behavioral patterns to caregivers. " +
            "CRITICAL RULES: " +
            "1. NEVER invent, extrapolate, or alter dose counts, percentages, or times. Ground all statements strictly in the supplied data. " +
            "2. NEVER recommend changing a patient's prescribed medication dose or schedule without physician supervision. " +
            "3. Output MUST be valid JSON with exactly two string fields: 'summaryText' (2-3 sentences explaining the facts clearly and compassionately) and 'suggestedFollowUp' (1-2 actionable, practical check-in steps for the caregiver).",
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const responseText = response.text?.trim();
      if (responseText) {
        const parsed = JSON.parse(responseText) as {
          summaryText?: string;
          suggestedFollowUp?: string;
        };

        if (parsed.summaryText && parsed.suggestedFollowUp) {
          return {
            summaryText: parsed.summaryText,
            suggestedFollowUp: parsed.suggestedFollowUp,
            generator: "AI_MODEL",
            modelName,
            promptVersion: "1.0",
          };
        }
      }

      return {
        summaryText: fallbackNarrative.summaryText,
        suggestedFollowUp: fallbackNarrative.suggestedFollowUp,
        generator: "RULES",
        modelName: "rules-deterministic-v1",
      };
    } catch {
      // Graceful fallback if network or external API error occurs
      return {
        summaryText: fallbackNarrative.summaryText,
        suggestedFollowUp: fallbackNarrative.suggestedFollowUp,
        generator: "RULES",
        modelName: "rules-deterministic-v1",
      };
    }
  }

  /**
   * Builds a structured, un-hallucinatable prompt payload containing only verified numbers.
   */
  private static buildPrompt(
    metrics: AdherenceMetrics,
    patterns: AdherencePattern[],
    riskLevel: RiskLevel,
  ): string {
    return JSON.stringify(
      {
        task: "Explain the patient's verified medication adherence record to their caregiver.",
        riskLevel,
        statistics: {
          totalScheduled: metrics.totalScheduled,
          confirmedCount: metrics.confirmedCount,
          unconfirmedCount: metrics.unconfirmedCount,
          missedCount: metrics.missedCount,
          delayedCount: metrics.delayedCount,
          confirmationRate: `${Math.round(metrics.confirmationRate * 100)}%`,
          averageDelayMinutes: metrics.averageDelayMinutes,
          trend: metrics.trend,
          timeOfDayBuckets: metrics.timeOfDay,
        },
        detectedPatterns: patterns.map((p) => ({
          type: p.type,
          severity: p.severity,
          description: p.description,
        })),
      },
      null,
      2,
    );
  }
}
