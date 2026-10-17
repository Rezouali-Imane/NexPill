import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { MedicationInformationService } from "../services/medication-information.service";

export const createMedicalMcpServer = (_userId: string): McpServer => {
  const server = new McpServer({
    name: "nexpill-medical",
    version: "1.0.0",
  });

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

  return server;
};
