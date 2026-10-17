import { afterEach, describe, expect, it, vi } from "vitest";
import { MedicationInformationService } from "../src/services/medication-information.service";

describe("MedicationInformationService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes RxNorm matches from the trusted source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            approximateGroup: {
              candidate: [
                {
                  rxcui: "860975",
                  name: "metformin 500 MG Oral Tablet",
                  synonym: "metformin",
                  tty: "SBD",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      MedicationInformationService.lookup("metformin"),
    ).resolves.toMatchObject({
      query: "metformin",
      source: "RxNorm",
      matches: [
        {
          rxCui: "860975",
          name: "metformin 500 MG Oral Tablet",
          synonym: "metformin",
          termType: "SBD",
        },
      ],
    });
  });

  it("returns an empty match list when RxNorm finds nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ approximateGroup: {} }), { status: 200 }),
      ),
    );

    await expect(
      MedicationInformationService.lookup("not-a-real-medication"),
    ).resolves.toMatchObject({ matches: [] });
  });

  it("does not expose upstream errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("upstream failure", { status: 503 })),
    );

    await expect(
      MedicationInformationService.lookup("metformin"),
    ).rejects.toThrow("Trusted medication information source returned an error.");
  });
});
