import {
  type ModelCapabilities,
  type PiSettings,
  type ProviderOptionDescriptor,
  ProviderDriverKind,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { causeErrorTag } from "@t3tools/shared/observability";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";

import { makePiAcpRuntime } from "../acp/PiAcpSupport.ts";
import {
  buildBooleanOptionDescriptor,
  buildSelectOptionDescriptor,
  buildServerProvider,
  providerModelsFromSettings,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const PROVIDER = ProviderDriverKind.make("pi");
const PI_ACP_DISCOVERY_TIMEOUT_MS = 20_000;
const PI_PRESENTATION = {
  displayName: "Pi",
  badgeLabel: "Early Access",
  showInteractionModeToggle: false,
} as const;
const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});
const isAcpSpawnError = Schema.is(EffectAcpErrors.AcpSpawnError);

interface PiDiscovery {
  readonly version: string | null;
  readonly models: ReadonlyArray<ServerProviderModel>;
}

function flattenSelectOptions(
  option: EffectAcpSchema.SessionConfigOption,
): ReadonlyArray<{ readonly value: string; readonly label: string }> {
  if (option.type !== "select") return [];
  return option.options.flatMap((entry) =>
    "value" in entry
      ? [{ value: entry.value, label: entry.name }]
      : entry.options.map((nested) => ({ value: nested.value, label: nested.name })),
  );
}

export function buildPiCapabilities(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption> | null | undefined,
): ModelCapabilities {
  const descriptors: Array<ProviderOptionDescriptor> = [];
  for (const option of configOptions ?? []) {
    if (option.id === "model") continue;
    if (option.type === "boolean") {
      descriptors.push(
        buildBooleanOptionDescriptor({
          id: option.id,
          label: option.name,
          currentValue: option.currentValue,
          ...(option.description ? { description: option.description } : {}),
        }),
      );
      continue;
    }
    const choices = flattenSelectOptions(option);
    if (choices.length === 0) continue;
    descriptors.push(
      buildSelectOptionDescriptor({
        id: option.id,
        label: option.name,
        ...(option.description ? { description: option.description } : {}),
        options: choices.map((choice) => ({
          ...choice,
          ...(choice.value === option.currentValue ? { isDefault: true } : {}),
        })),
      }),
    );
  }
  return createModelCapabilities({ optionDescriptors: descriptors });
}

export function buildPiModelsFromSessionSetup(
  setup:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): ReadonlyArray<ServerProviderModel> {
  const capabilities = buildPiCapabilities(setup.configOptions);
  const seen = new Set<string>();
  return (setup.models?.availableModels ?? []).flatMap((model) => {
    const slug = model.modelId.trim();
    if (!slug || seen.has(slug)) return [];
    seen.add(slug);
    return [
      {
        slug,
        name: model.name.trim() || slug,
        isCustom: false,
        capabilities,
      } satisfies ServerProviderModel,
    ];
  });
}

function piFallbackModels(settings: PiSettings): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(
    [
      {
        slug: "default",
        name: "Pi default model",
        isCustom: false,
        capabilities: EMPTY_CAPABILITIES,
      },
    ],
    PROVIDER,
    settings.customModels,
    EMPTY_CAPABILITIES,
  );
}

export function buildInitialPiProviderSnapshot(
  settings: PiSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    const models = piFallbackModels(settings);
    return buildServerProvider({
      presentation: PI_PRESENTATION,
      enabled: settings.enabled,
      checkedAt,
      models,
      probe: settings.enabled
        ? {
            installed: true,
            version: null,
            status: "warning",
            auth: { status: "unknown" },
            message: "Checking Pi ACP availability...",
          }
        : {
            installed: false,
            version: null,
            status: "warning",
            auth: { status: "unknown" },
            message: "Pi is disabled in T3 Code settings.",
          },
    });
  });
}

const discoverPi = (settings: PiSettings, cwd: string, environment: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const runtime = yield* makePiAcpRuntime({
      piSettings: settings,
      environment,
      childProcessSpawner,
      cwd,
      clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    });
    const started = yield* runtime.start();
    return {
      version: started.initializeResult.agentInfo?.version?.trim() || null,
      models: buildPiModelsFromSessionSetup(started.sessionSetupResult),
    } satisfies PiDiscovery;
  }).pipe(Effect.scoped);

export const checkPiProviderStatus = Effect.fn("checkPiProviderStatus")(function* (
  settings: PiSettings,
  cwd: string,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const fallbackModels = piFallbackModels(settings);
  if (!settings.enabled) {
    return yield* buildInitialPiProviderSnapshot(settings);
  }

  const discoveryExit = yield* discoverPi(settings, cwd, environment).pipe(
    Effect.timeoutOption(PI_ACP_DISCOVERY_TIMEOUT_MS),
    Effect.exit,
  );
  if (Exit.isSuccess(discoveryExit) && Option.isSome(discoveryExit.value)) {
    const discovery = discoveryExit.value.value;
    return buildServerProvider({
      presentation: PI_PRESENTATION,
      enabled: true,
      checkedAt,
      models: providerModelsFromSettings(
        discovery.models.length > 0 ? discovery.models : fallbackModels,
        PROVIDER,
        settings.customModels,
        EMPTY_CAPABILITIES,
      ),
      probe: {
        installed: true,
        version: discovery.version,
        status: "ready",
        auth: { status: "authenticated", label: "Pi model provider" },
      },
    });
  }

  if (Exit.isSuccess(discoveryExit)) {
    return buildServerProvider({
      presentation: PI_PRESENTATION,
      enabled: true,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: `Pi ACP startup timed out after ${PI_ACP_DISCOVERY_TIMEOUT_MS}ms.`,
      },
    });
  }

  const failure = discoveryExit.cause;
  const failureOption = Cause.findErrorOption(failure);
  const adapterMissing = Option.isSome(failureOption) && isAcpSpawnError(failureOption.value);
  yield* Effect.logWarning("Pi ACP discovery failed", {
    errorTag: causeErrorTag(failure),
  });
  return buildServerProvider({
    presentation: PI_PRESENTATION,
    enabled: true,
    checkedAt,
    models: fallbackModels,
    probe: {
      installed: !adapterMissing,
      version: null,
      status: "error",
      auth: { status: "unknown" },
      message: adapterMissing
        ? "Pi ACP adapter (`pi-acp`) is not installed or not on PATH. Install `pi-acp` and the Pi coding agent."
        : "Pi ACP startup failed. Ensure `pi` is installed and configure a model provider by running `pi` in a terminal.",
    },
  });
});
