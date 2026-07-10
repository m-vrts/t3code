import { describe, expect, it } from "vite-plus/test";

import { buildPiAcpSpawnInput, resolvePiAcpModelId } from "./PiAcpSupport.ts";

describe("buildPiAcpSpawnInput", () => {
  it("builds the default pi-acp command", () => {
    expect(
      buildPiAcpSpawnInput({ binaryPath: "pi-acp", piBinaryPath: "pi" }, "/tmp/project"),
    ).toEqual({
      command: "pi-acp",
      args: [],
      cwd: "/tmp/project",
      env: { PI_ACP_PI_COMMAND: "pi" },
    });
  });

  it("honors custom adapter and Pi executable paths without dropping environment variables", () => {
    expect(
      buildPiAcpSpawnInput({ binaryPath: "/opt/pi-acp", piBinaryPath: "/opt/pi" }, "/workspace", {
        TEST_TOKEN: "present",
      }),
    ).toEqual({
      command: "/opt/pi-acp",
      args: [],
      cwd: "/workspace",
      env: {
        TEST_TOKEN: "present",
        PI_ACP_PI_COMMAND: "/opt/pi",
      },
    });
  });
});

describe("resolvePiAcpModelId", () => {
  it("preserves provider-qualified model ids", () => {
    expect(resolvePiAcpModelId("anthropic/claude-sonnet-4-5")).toBe("anthropic/claude-sonnet-4-5");
  });

  it("uses the current Pi model when no selection is available", () => {
    expect(resolvePiAcpModelId(undefined)).toBe("default");
  });
});
