import { Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMedicalMcpServer } from "../mcp/medical-server";
import { requireAuth } from "../middleware/require-auth";
import { requireRole } from "../middleware/require-role";

export const mcpRouter = Router();

mcpRouter.post("/", requireAuth, requireRole("USER", "ADMIN"), async (request, response) => {
  const server = createMedicalMcpServer(request.user!.id);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error("Medical MCP request failed:", error);
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Medical MCP request failed." },
        id: null,
      });
    }
  } finally {
    await transport.close();
    await server.close();
  }
});

mcpRouter.get("/", (_request, response) => {
  response.status(405).json({
    error: "Medical MCP supports POST requests only.",
  });
});

mcpRouter.delete("/", (_request, response) => {
  response.status(405).json({
    error: "Medical MCP sessions are stateless and cannot be deleted.",
  });
});
