import { defineHandler } from 'kumoh/app';

export const GET = defineHandler(async (c) => {
  const room = c.req.query('room') ?? 'default';
  const ns = c.env.CHAT_ROOM;
  const id = ns.idFromName(room);
  const stub = ns.get(id);
  return stub.fetch(c.req.raw);
});
