import { describe, expect, it, vi } from "vitest";
import {
  resolveExecutionRunAdapterConfig,
  resolveModelProviderUrlFromEnv,
} from "../services/heartbeat.ts";

describe("resolveExecutionRunAdapterConfig", () => {
  it("overlays project env on top of agent env and unions secret keys", async () => {
    const resolveAdapterConfigForRuntime = vi.fn().mockResolvedValue({
      config: {
        env: {
          SHARED_KEY: "agent",
          AGENT_ONLY: "agent-only",
        },
        other: "value",
      },
      secretKeys: new Set(["AGENT_SECRET"]),
    });
    const resolveEnvBindings = vi.fn().mockResolvedValue({
      env: {
        SHARED_KEY: "project",
        PROJECT_ONLY: "project-only",
      },
      secretKeys: new Set(["PROJECT_SECRET"]),
    });

    const result = await resolveExecutionRunAdapterConfig({
      companyId: "company-1",
      executionRunConfig: { env: { SHARED_KEY: "agent" } },
      projectEnv: { SHARED_KEY: "project" },
      secretsSvc: {
        resolveAdapterConfigForRuntime,
        resolveEnvBindings,
      } as any,
    });

    expect(result.resolvedConfig).toMatchObject({
      other: "value",
      env: {
        SHARED_KEY: "project",
        AGENT_ONLY: "agent-only",
        PROJECT_ONLY: "project-only",
      },
    });
    expect(Array.from(result.secretKeys).sort()).toEqual(["AGENT_SECRET", "PROJECT_SECRET"]);
  });

  it("skips project env resolution when the project has no bindings", async () => {
    const resolveAdapterConfigForRuntime = vi.fn().mockResolvedValue({
      config: { env: { AGENT_ONLY: "agent-only" } },
      secretKeys: new Set<string>(),
    });
    const resolveEnvBindings = vi.fn();

    const result = await resolveExecutionRunAdapterConfig({
      companyId: "company-1",
      executionRunConfig: { env: { AGENT_ONLY: "agent-only" } },
      projectEnv: null,
      secretsSvc: {
        resolveAdapterConfigForRuntime,
        resolveEnvBindings,
      } as any,
    });

    expect(result.resolvedConfig.env).toEqual({ AGENT_ONLY: "agent-only" });
    expect(resolveEnvBindings).not.toHaveBeenCalled();
  });
});

describe("resolveModelProviderUrlFromEnv", () => {
  it("normalizes explicit provider base URLs", () => {
    expect(
      resolveModelProviderUrlFromEnv({
        OPENAI_BASE_URL: "https://openrouter.ai/api/v1/",
      }),
    ).toBe("https://openrouter.ai/api/v1");
  });

  it("falls back to canonical provider URLs when only auth keys are present", () => {
    expect(resolveModelProviderUrlFromEnv({ OPENAI_API_KEY: "sk-openai" })).toBe("https://api.openai.com/v1");
    expect(resolveModelProviderUrlFromEnv({ ANTHROPIC_API_KEY: "sk-ant" })).toBe("https://api.anthropic.com");
    expect(resolveModelProviderUrlFromEnv({ GOOGLE_API_KEY: "sk-google" })).toBe(
      "https://generativelanguage.googleapis.com",
    );
  });

  it("returns null when no provider URL can be inferred", () => {
    expect(resolveModelProviderUrlFromEnv({})).toBeNull();
  });
});
