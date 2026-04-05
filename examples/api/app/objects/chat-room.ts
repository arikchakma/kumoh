import { DurableObject } from 'cloudflare:workers';

type OutgoingMessage =
  | { type: 'joined'; count: number }
  | { type: 'count'; count: number }
  | { type: 'message'; text: string; count: number };

const PING_INTERVAL_MS = 15_000;
const SOCKET_TIMEOUT_MS = 30_000;

export class ChatRoom extends DurableObject<KumohBindings> {
  private broadcast(msg: OutgoingMessage, exclude?: WebSocket): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(payload);
        } catch {
          // already closed
        }
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ lastPing: Date.now() });

    if (!(await this.ctx.storage.getAlarm())) {
      await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS);
    }

    const count = this.ctx.getWebSockets().length;
    this.broadcast({ type: 'count', count }, server);
    server.send(
      JSON.stringify({ type: 'joined', count } satisfies OutgoingMessage)
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    const text =
      typeof message === 'string' ? message : new TextDecoder().decode(message);

    try {
      const msg = JSON.parse(text) as { type: string };
      if (msg?.type === 'ping') {
        ws.serializeAttachment({ lastPing: Date.now() });
        return;
      }
    } catch {
      // not JSON — treat as plain text chat message
    }

    const count = this.ctx.getWebSockets().length;
    this.broadcast({ type: 'message', text, count });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.close();
    const count = this.ctx.getWebSockets().length;
    this.broadcast({ type: 'count', count });
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, 'WebSocket error');
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    let closedAny = false;

    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as {
        lastPing: number;
      } | null;
      const lastPing = attachment?.lastPing ?? now;
      if (now - lastPing > SOCKET_TIMEOUT_MS) {
        ws.close(1001, 'Connection timed out');
        closedAny = true;
      }
    }

    if (closedAny) {
      const count = this.ctx.getWebSockets().length;
      this.broadcast({ type: 'count', count });
    }

    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS);
    }
  }
}
