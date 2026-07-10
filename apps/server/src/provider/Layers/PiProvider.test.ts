import * as NodeServices from "@effect/platform-node/NodeServices";
import { PiSettings } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as EffectAcpSchema from "effect-acp/schema";

import {
  buildPiCapabilities,
  buildPiModelsFromSessionSetup,
  checkPiProviderStatus,
} from "./PiProvider.ts";

const decodePiSettings = Schema.decodeSync(PiSettings);

const setup = {
  sessionId: "pi-session",
  models: {
    currentModelId: "anthropic/claude-sonnet-4-5",
    availableModels: [
      {
        modelId: "anthropic/claude-sonnet-4-5",
        name: "anthropic/Claude Sonnet 4.5",
      },
      {
        modelId: "openai/gpt-5.4",
        name: "openai/GPT-5.4",
      },
    ],
  },
  configOptions: [
    {
      type: "select",
      id: "model",
      category: "model",
      name: "Model",
      currentValue: "anthropic/claude-sonnet-4-5",
      options: [],
    },
    {
      type: "select",
      id: "thought_level",
      category: "thought_level",
      name: "Thinking",
      description: "Set the reasoning effort for this session",
      currentValue: "high",
      options: [
        { value: "low", name: "Thinking: low" },
        { value: "high", name: "Thinking: high" },
      ],
    },
  ],
} satisfies EffectAcpSchema.NewSessionResponse;

describe("Pi provider discovery mapping", () => {
  it("maps ACP models and shares thinking capabilities", () => {
    const models = buildPiModelsFromSessionSetup(setup);
    expect(models.map((model) => model.slug)).toEqual([
      "anthropic/claude-sonnet-4-5",
      "openai/gpt-5.4",
    ]);
    expect(models[0]?.capabilities?.optionDescriptors).toEqual([
      expect.objectContaining({
        id: "thought_level",
        label: "Thinking",
        currentValue: "high",
      }),
    ]);
  });

  it("does not expose the ACP model config as a duplicate provider option", () => {
    expect(
      buildPiCapabilities(setup.configOptions).optionDescriptors?.map((item) => item.id),
    ).toEqual(["thought_level"]);
  });
});

it.layer(NodeServices.layer)("checkPiProviderStatus", (it) => {
  it.effect("reports a missing pi-acp executable", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkPiProviderStatus(
        decodePiSettings({
          enabled: true,
          binaryPath: "/definitely/not/installed/pi-acp",
        }),
        process.cwd(),
      );
      expect(snapshot.installed).toBe(false);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toContain("pi-acp");
    }),
  );
});
