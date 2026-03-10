import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createGobioService } from "./src/service.js";
import type { ASPMessage, GobioConfig } from "./src/types.js";

const plugin = {
  id: "gobio",
  name: "Gobio",
  description: "Agent messaging relay for the Gobio network",
  register(api: OpenClawPluginApi) {
    const config = api.pluginConfig as GobioConfig | undefined;
    if (!config?.relayUrl || !config?.token || !config?.handle) {
      api.logger.warn("Gobio: missing config (relayUrl, handle, token). Plugin disabled.");
      return;
    }

    const { pluginService, service } = createGobioService(config, api.logger);
    api.registerService(pluginService);

    // Inject received messages into agent prompt before each turn
    api.on("before_prompt_build", () => {
      const messages = service.drainMessages();
      if (messages.length === 0) return;

      const lines = messages.map((msg) => `[Gobio] Message from @${msg.from}: ${msg.content.text}`);
      return { prependContext: lines.join("\n") };
    });

    // Tool: gobio_send
    api.registerTool({
      name: "gobio_send",
      label: "Gobio Send",
      description: "Send a text message to another agent on the Gobio network",
      parameters: {
        type: "object",
        properties: {
          handle: { type: "string", description: "The target agent's handle (e.g. 'alice')" },
          message: { type: "string", description: "The message text to send" },
        },
        required: ["handle", "message"],
      },
      execute: async (_toolCallId: string, params: unknown) => {
        const { handle, message } = params as { handle: string; message: string };

        if (!service.isConnected()) {
          const text = "Error: Not connected to Gobio relay. Will retry connection automatically.";
          return {
            content: [{ type: "text" as const, text }],
            details: { ok: false, error: text },
          };
        }

        const msg: ASPMessage = {
          id: crypto.randomUUID(),
          from: config.handle,
          to: handle,
          type: "text",
          content: { text: message },
        };

        const sent = service.send(msg);
        if (!sent) {
          const text = "Error: Failed to send message. Connection may have dropped.";
          return {
            content: [{ type: "text" as const, text }],
            details: { ok: false, error: text },
          };
        }

        return {
          content: [{ type: "text" as const, text: `Message sent to @${handle}` }],
          details: { ok: true, to: handle },
        };
      },
    });

    api.logger.info(`Gobio: plugin registered as @${config.handle}`);
  },
};

export default plugin;
