// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { PiSettings, ProviderDriverKind, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { ServerConfig } from "../../config.ts";
import { makePiAdapter } from "./PiAdapter.ts";

const decodePiSettings = Schema.decodeSync(PiSettings);
const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const mockAgentPath = NodePath.join(__dirname, "../../../scripts/acp-mock-agent.ts");

async function makeMockPiAcpWrapper() {
  const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pi-acp-mock-"));
  const wrapperPath = NodePath.join(dir, "pi-acp");
  await NodeFSP.writeFile(
    wrapperPath,
    `#!/bin/sh\nexec node ${JSON.stringify(mockAgentPath)} "$@"\n`,
    "utf8",
  );
  await NodeFSP.chmod(wrapperPath, 0o755);
  return wrapperPath;
}

it.layer(
  ServerConfig.layerTest(process.cwd(), { prefix: "t3code-pi-adapter-test-" }).pipe(
    Layer.provideMerge(NodeServices.layer),
  ),
)("PiAdapter", (it) => {
  it.effect("uses the shared ACP lifecycle with Pi provider identity", () =>
    Effect.gen(function* () {
      const wrapperPath = yield* Effect.promise(makeMockPiAcpWrapper);
      const settings = decodePiSettings({
        enabled: true,
        binaryPath: wrapperPath,
      });
      const adapter = yield* makePiAdapter(settings);
      const threadId = ThreadId.make("pi-mock-thread");

      const eventsFiber = yield* adapter.streamEvents.pipe(
        Stream.filter((event) => event.threadId === threadId),
        Stream.takeUntil((event) => event.type === "turn.completed"),
        Stream.runCollect,
        Effect.forkChild,
      );

      const session = yield* adapter.startSession({
        threadId,
        provider: ProviderDriverKind.make("pi"),
        cwd: process.cwd(),
        runtimeMode: "full-access",
        modelSelection: {
          instanceId: ProviderInstanceId.make("pi"),
          model: "default",
        },
      });
      assert.equal(session.provider, "pi");
      assert.deepStrictEqual(session.resumeCursor, {
        schemaVersion: 1,
        sessionId: "mock-session-1",
      });

      yield* adapter.sendTurn({
        threadId,
        input: "hello from Pi",
        attachments: [],
      });

      const eventTypes = Array.from(yield* Fiber.join(eventsFiber), (event) => event.type);
      assert.include(eventTypes, "content.delta");
      assert.include(eventTypes, "turn.plan.updated");
      assert.include(eventTypes, "turn.completed");

      yield* adapter.stopSession(threadId);
    }).pipe(Effect.scoped),
  );
});
