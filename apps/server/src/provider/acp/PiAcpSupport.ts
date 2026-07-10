import { type PiSettings, type ProviderOptionSelection } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import type * as EffectAcpErrors from "effect-acp/errors";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

const PI_ACP_AUTH_METHOD_ID = "pi_terminal_login";
const PI_ACP_PI_COMMAND_ENV = "PI_ACP_PI_COMMAND";

type PiAcpRuntimeSettings = Pick<PiSettings, "binaryPath" | "piBinaryPath">;

export interface PiAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly piSettings: PiAcpRuntimeSettings;
  readonly environment?: NodeJS.ProcessEnv;
}

export function buildPiAcpSpawnInput(
  settings: PiAcpRuntimeSettings,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSessionRuntime.AcpSpawnInput {
  return {
    command: settings.binaryPath || "pi-acp",
    args: [],
    cwd,
    env: {
      ...environment,
      ...(settings.piBinaryPath ? { [PI_ACP_PI_COMMAND_ENV]: settings.piBinaryPath } : {}),
    },
  };
}

export const makePiAcpRuntime = (
  input: PiAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildPiAcpSpawnInput(input.piSettings, input.cwd, input.environment),
        authMethodId: PI_ACP_AUTH_METHOD_ID,
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
  });

export function resolvePiAcpModelId(model: string | null | undefined): string {
  return model?.trim() || "default";
}

export function applyPiAcpModelSelection(input: {
  readonly runtime: AcpSessionRuntime.AcpSessionRuntime["Service"];
  readonly model: string;
  readonly selections: ReadonlyArray<ProviderOptionSelection> | null | undefined;
}): Effect.Effect<void, EffectAcpErrors.AcpError> {
  return Effect.gen(function* () {
    if (resolvePiAcpModelId(input.model) !== "default") {
      yield* input.runtime.setModel(resolvePiAcpModelId(input.model));
    }

    const availableOptions = yield* input.runtime.getConfigOptions;
    const availableIds = new Set(availableOptions.map((option) => option.id));
    for (const selection of input.selections ?? []) {
      if (selection.id === "model" || !availableIds.has(selection.id)) {
        continue;
      }
      yield* input.runtime.setConfigOption(selection.id, selection.value);
    }
  });
}
