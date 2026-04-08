import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "./execute.js";

async function writeFakeOpenCodeCommand(commandPath: string): Promise<void> {
  const script = `#!/usr/bin/env node
const fs = require("node:fs");

const capturePath = process.env.PAPERCLIP_TEST_CAPTURE_PATH;
const payload = {
  argv: process.argv.slice(2),
  prompt: fs.readFileSync(0, "utf8"),
};
if (capturePath) {
  fs.writeFileSync(capturePath, JSON.stringify(payload), "utf8");
}
if (process.argv.includes("models")) {
  console.log("ollama/gemma4:26b");
  process.exit(0);
}
console.log(JSON.stringify({ sessionID: "opencode-session-1", type: "text", part: { text: "hello" } }));
console.log(JSON.stringify({ type: "step_finish", part: { tokens: { input: 1, output: 1, cache: { read: 0 } }, cost: 0 } }));
`;
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
}

type CapturePayload = {
  argv: string[];
  prompt: string;
};

describe("opencode execute", () => {
  it("does not pass --session when resumeSessions is disabled", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-opencode-execute-"));
    const workspace = path.join(root, "workspace");
    const commandPath = path.join(root, "opencode");
    const capturePath = path.join(root, "capture.json");
    await fs.mkdir(workspace, { recursive: true });
    await writeFakeOpenCodeCommand(commandPath);

    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    const previousHome = process.env.HOME;
    process.env.HOME = root;
    try {
      const result = await execute({
        runId: "run-1",
        agent: {
          id: "agent-1",
          companyId: "company-1",
          name: "OpenCode Agent",
          adapterType: "opencode_local",
          adapterConfig: {},
        },
        runtime: {
          sessionId: "saved-session-1",
          sessionParams: {
            sessionId: "saved-session-1",
            cwd: workspace,
          },
          sessionDisplayId: "saved-session-1",
          taskKey: null,
        },
        config: {
          command: commandPath,
          cwd: workspace,
          model: "ollama/gemma4:26b",
          resumeSessions: false,
          env: {
            PAPERCLIP_TEST_CAPTURE_PATH: capturePath,
          },
          promptTemplate: "Continue.",
        },
        context: {},
        authToken: "token",
        onLog: async (stream, chunk) => {
          logs.push({ stream, chunk });
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.errorMessage).toBeNull();

      const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as CapturePayload;
      expect(capture.argv).toEqual([
        "run",
        "--format",
        "json",
        "--model",
        "ollama/gemma4:26b",
      ]);
      expect(logs).toContainEqual(
        expect.objectContaining({
          stream: "stdout",
          chunk: expect.stringContaining("resumeSessions is disabled"),
        }),
      );
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
