import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateContent = vi.fn();

import { AiSummaryService } from "../src/services/ai-summary.service";
import type { AdherenceMetrics } from "../src/services/adherence-analytics.service";

describe("AiSummaryService (Gemini LLM Integration)", () => {
  const originalEnv = process.env;

  const mockMetrics: AdherenceMetrics = {
    totalScheduled: 10,
    confirmedCount: 9,
    unconfirmedCount: 1,
    missedCount: 1,
    skippedCount: 0,
    delayedCount: 1,
    confirmationRate: 0.9,
    averageDelayMinutes: 12,
    trend: "STABLE",
    timeOfDay: {
      morning: { scheduled: 5, confirmed: 5, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 5 },
      afternoon: { scheduled: 0, confirmed: 0, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 0 },
      evening: { scheduled: 5, confirmed: 4, unconfirmed: 1, missed: 1, confirmationRate: 0.8, averageDelayMinutes: 18 },
      night: { scheduled: 0, confirmed: 0, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 0 },
    },
  };

  const fallbackNarrative = {
    summaryText: "Patient confirmed 9 of 10 doses.",
    suggestedFollowUp: "Check evening routine.",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    AiSummaryService.setClientForTesting(null);
  });

  it("falls back to deterministic narrative when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;

    const result = await AiSummaryService.generateSummary(
      mockMetrics,
      [],
      "STABLE",
      fallbackNarrative,
    );

    expect(result.generator).toBe("RULES");
    expect(result.modelName).toBe("rules-deterministic-v1");
    expect(result.summaryText).toBe(fallbackNarrative.summaryText);
    expect(result.suggestedFollowUp).toBe(fallbackNarrative.suggestedFollowUp);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("calls Gemini LLM and parses structured JSON summary when GEMINI_API_KEY is present", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    AiSummaryService.setClientForTesting({
      models: {
        generateContent: mockGenerateContent,
      },
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        summaryText: "Ahmed demonstrated strong overall medication adherence at 90%, with 9 out of 10 doses confirmed on time.",
        suggestedFollowUp: "Offer extra assistance during evening doses to prevent missed medication.",
      }),
    });

    const result = await AiSummaryService.generateSummary(
      mockMetrics,
      [],
      "NEEDS_ATTENTION",
      fallbackNarrative,
    );

    expect(result.generator).toBe("AI_MODEL");
    expect(result.modelName).toBe("gemini-2.5-flash");
    expect(result.summaryText).toContain("Ahmed demonstrated strong overall medication adherence at 90%");
    expect(result.suggestedFollowUp).toContain("Offer extra assistance during evening doses");
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("gracefully falls back to deterministic narrative if Gemini API call fails", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    AiSummaryService.setClientForTesting({
      models: {
        generateContent: mockGenerateContent,
      },
    });
    mockGenerateContent.mockRejectedValueOnce(new Error("Gemini quota exceeded or network timeout"));

    const result = await AiSummaryService.generateSummary(
      mockMetrics,
      [],
      "NEEDS_ATTENTION",
      fallbackNarrative,
    );

    expect(result.generator).toBe("RULES");
    expect(result.summaryText).toBe(fallbackNarrative.summaryText);
    expect(result.suggestedFollowUp).toBe(fallbackNarrative.suggestedFollowUp);
  });

  it("gracefully falls back if Gemini returns non-JSON or malformed output", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    AiSummaryService.setClientForTesting({
      models: {
        generateContent: mockGenerateContent,
      },
    });
    mockGenerateContent.mockResolvedValueOnce({
      text: "I am unable to answer in JSON format.",
    });

    const result = await AiSummaryService.generateSummary(
      mockMetrics,
      [],
      "NEEDS_ATTENTION",
      fallbackNarrative,
    );

    expect(result.generator).toBe("RULES");
    expect(result.summaryText).toBe(fallbackNarrative.summaryText);
  });
});
