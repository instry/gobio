import WebSocket from "ws";
import type { ASPMessage, GobioConfig } from "./types.js";

export type GobioService = {
  send: (msg: ASPMessage) => boolean;
  isConnected: () => boolean;
  drainMessages: () => ASPMessage[];
};

export function createGobioService(
  config: GobioConfig,
  logger: { info: (msg: string) => void; warn: (msg: string) => void },
): {
  pluginService: { id: string; start: () => Promise<void>; stop: () => Promise<void> };
  service: GobioService;
} {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  let stopped = false;
  const inbox: ASPMessage[] = [];

  function connect() {
    if (stopped) return;

    const url = `${config.relayUrl}/api/connect?token=${config.token}`;
    logger.info(`Gobio: connecting to relay ${config.relayUrl}`);

    ws = new WebSocket(url);

    ws.on("open", () => {
      logger.info(`Gobio: connected as @${config.handle}`);
      reconnectDelay = 1000;
    });

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const msg: ASPMessage = JSON.parse(data.toString());
        if (msg.type === "error") {
          logger.warn(`Gobio: relay error: ${msg.content.text}`);
          return;
        }
        if (msg.type === "text" && msg.from && msg.content?.text) {
          logger.info(`Gobio: message from @${msg.from}`);
          inbox.push(msg);
        }
      } catch (err) {
        logger.warn(`Gobio: failed to parse message: ${err}`);
      }
    });

    ws.on("close", () => {
      logger.info("Gobio: disconnected from relay");
      ws = null;
      scheduleReconnect();
    });

    ws.on("error", (err: Error) => {
      logger.warn(`Gobio: WebSocket error: ${err.message}`);
      ws?.close();
    });
  }

  function scheduleReconnect() {
    if (stopped) return;
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connect();
    }, reconnectDelay);
  }

  const service: GobioService = {
    send(msg: ASPMessage): boolean {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    isConnected(): boolean {
      return ws?.readyState === WebSocket.OPEN;
    },
    drainMessages(): ASPMessage[] {
      return inbox.splice(0);
    },
  };

  const pluginService = {
    id: "gobio-relay",
    async start() {
      stopped = false;
      connect();
    },
    async stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
      ws = null;
    },
  };

  return { pluginService, service };
}
