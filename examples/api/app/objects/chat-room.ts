import { DurableObject } from 'cloudflare:workers';
import { asc, db, eq } from 'kumoh/db';

import { chatMessages } from '../db/schema';

type OutgoingMessage =
  | { type: 'joined'; count: number }
  | { type: 'count'; count: number }
  | { type: 'message'; username: string; text: string; count: number }
  | {
      type: 'history';
      messages: Array<{ username: string; text: string; createdAt: number }>;
    };

type Attachment = { lastPing: number; username: string; room: string };

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

    const url = new URL(request.url);
    const room = url.searchParams.get('room') ?? 'default';
    const username = url.searchParams.get('username') ?? 'anonymous';

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      lastPing: Date.now(),
      username,
      room,
    } satisfies Attachment);

    if (!(await this.ctx.storage.getAlarm())) {
      await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS);
    }

    const history = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.roomId, room))
      .orderBy(asc(chatMessages.createdAt));

    server.send(
      JSON.stringify({
        type: 'history',
        messages: history.map((m) => ({
          username: m.username,
          text: m.text,
          createdAt: m.createdAt,
        })),
      } satisfies OutgoingMessage)
    );

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

    let parsed: { type: string; text?: string };
    try {
      parsed = JSON.parse(text) as { type: string; text?: string };
    } catch {
      return;
    }

    if (parsed.type === 'ping') {
      const prev = ws.deserializeAttachment() as Attachment;
      ws.serializeAttachment({ ...prev, lastPing: Date.now() });
      return;
    }

    if (parsed.type === 'message' && parsed.text) {
      const { username, room } = ws.deserializeAttachment() as Attachment;
      await db
        .insert(chatMessages)
        .values({ roomId: room, username, text: parsed.text });
      const count = this.ctx.getWebSockets().length;
      this.broadcast({ type: 'message', username, text: parsed.text, count });
    }
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
      const attachment = ws.deserializeAttachment() as Attachment | null;
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
