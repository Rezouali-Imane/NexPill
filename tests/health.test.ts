import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app";

describe("GET / (Root Service Endpoint)", () => {
  it("should return root health status and service metadata", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.service).toBe("NexPill API");
    expect(response.body.docs).toBe("/docs");
  });
});

describe("GET /health", () => {
  it("should return status ok", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("GET /docs and /docs.json (Swagger)", () => {
  it("should serve OpenAPI specification JSON", async () => {
    const response = await request(app).get("/docs.json");
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.info.title).toContain("NexPill");
    expect(response.body.paths["/medications"]).toBeDefined();
    expect(response.body.paths["/schedules/{id}"]).toBeDefined();
  });

  it("should serve Swagger UI HTML", async () => {
    const response = await request(app).get("/docs/");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Swagger UI");
  });
});

