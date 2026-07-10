import { type PiSettings, ProviderDriverKind, type ProviderInstanceId } from "@t3tools/contracts";

import {
  applyPiAcpModelSelection,
  makePiAcpRuntime,
  resolvePiAcpModelId,
} from "../acp/PiAcpSupport.ts";
import { makeAcpProviderAdapter, type AcpProviderAdapterOptions } from "./AcpProviderAdapter.ts";

const PI_PROVIDER = ProviderDriverKind.make("pi");

export interface PiAdapterLiveOptions extends AcpProviderAdapterOptions<PiSettings> {
  readonly instanceId?: ProviderInstanceId;
}

export function makePiAdapter(piSettings: PiSettings, options?: PiAdapterLiveOptions) {
  return makeAcpProviderAdapter(
    {
      provider: PI_PROVIDER,
      displayName: "Pi",
      settings: piSettings,
      configureInteractionMode: false,
      makeRuntime: (settings, input) =>
        makePiAcpRuntime({
          ...input,
          piSettings: settings,
        }),
      applyModelSelection: applyPiAcpModelSelection,
      resolveModel: resolvePiAcpModelId,
    },
    options,
  );
}
