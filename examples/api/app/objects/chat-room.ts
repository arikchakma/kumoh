import { DurableObject } from 'cloudflare:workers';

type OutgoingMessage =
  | { type: 'joined'; count: number }
  | { type: 'count'; count: number }
  | { type: 'message'; text: string; count: number };

export class ChatRoom extends DurableObject<{
  CHAT_ROOM: DurableObjectNamespace;
}> {
  constructor(
    state: DurableObjectState,
    env: {
      CHAT_ROOM: DurableObjectNamespace;
    }
  ) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);

    const count = this.ctx.getWebSockets().length;

    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== server) {
        ws.send(
          JSON.stringify({ type: 'count', count } satisfies OutgoingMessage)
        );
      }
    }

    server.send(
      JSON.stringify({ type: 'joined', count } satisfies OutgoingMessage)
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    _ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    const text =
      typeof message === 'string' ? message : new TextDecoder().decode(message);

    const count = this.ctx.getWebSockets().length;
    const payload = JSON.stringify({
      type: 'message',
      text,
      count,
    } satisfies OutgoingMessage);

    for (const ws of this.ctx.getWebSockets()) {
      ws.send(payload);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.close();
    const count = this.ctx.getWebSockets().length;
    for (const client of this.ctx.getWebSockets()) {
      try {
        client.send(
          JSON.stringify({ type: 'count', count } satisfies OutgoingMessage)
        );
      } catch {
        // already closed
      }
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, 'WebSocket error');
  }
}
