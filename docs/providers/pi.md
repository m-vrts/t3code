# Pi

T3 Code connects to the Pi coding agent through its ACP adapter. Install both executables on the
machine that runs the T3 Code server:

```bash
npm install -g @mariozechner/pi-coding-agent pi-acp
```

Run Pi once in a terminal and configure at least one model provider:

```bash
pi
```

Then open **Settings → Providers → Pi**, enable the provider, and refresh its status. T3 Code will
discover Pi's configured models and thinking levels automatically.

## Custom executable paths

The default commands are `pi-acp` and `pi`. If they are not on the server's `PATH`, set **pi-acp
binary path** and **Pi binary path** on the provider card. Additional environment variables can be
configured on the same card for isolated accounts or model-provider credentials.

## Sessions and tools

Pi sessions are persisted by Pi and can be resumed after T3 Code restarts. Assistant output, tool
calls, images, cancellation, and model/thinking selection are transported through ACP. Pi executes
its filesystem and shell tools locally on the T3 Code server; configure permissions and credentials
for that server environment accordingly. The current `pi-acp` bridge does not delegate T3 Code's
MCP servers, filesystem, or terminal APIs to Pi.
