const RXNORM_ENDPOINT = "https://rxnav.nlm.nih.gov/REST/approximateTerm.json";
const REQUEST_TIMEOUT_MS = 5_000;

interface RxNormConcept {
  rxcui?: string;
  name?: string;
  synonym?: string;
  tty?: string;
}

interface RxNormResponse {
  approximateGroup?: {
    candidate?: RxNormConcept[];
  };
}

export interface MedicationInformation {
  query: string;
  source: "RxNorm";
  sourceUrl: string;
  matches: Array<{
    rxCui: string;
    name: string;
    synonym?: string;
    termType?: string;
  }>;
}

export class MedicationInformationService {
  static async lookup(query: string): Promise<MedicationInformation> {
    const url = new URL(RXNORM_ENDPOINT);
    url.searchParams.set("term", query);
    url.searchParams.set("maxEntries", "5");

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error("Trusted medication information source is unavailable.");
    }

    if (!response.ok) {
      throw new Error("Trusted medication information source returned an error.");
    }

    const payload = (await response.json()) as RxNormResponse;
    const matches = (payload.approximateGroup?.candidate ?? [])
      .filter(
        (candidate): candidate is RxNormConcept & { rxcui: string; name: string } =>
          typeof candidate.rxcui === "string" && typeof candidate.name === "string",
      )
      .map((candidate) => ({
        rxCui: candidate.rxcui,
        name: candidate.name,
        ...(candidate.synonym ? { synonym: candidate.synonym } : {}),
        ...(candidate.tty ? { termType: candidate.tty } : {}),
      }));

    return {
      query,
      source: "RxNorm",
      sourceUrl: url.toString(),
      matches,
    };
  }
}
