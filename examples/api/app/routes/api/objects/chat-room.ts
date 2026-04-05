import { defineHandler } from 'kumoh/app';
import { objects } from 'kumoh/objects';

export const GET = defineHandler(async (c) => {
  const room = c.req.query('room') ?? 'default';
  const stub = objects.chatRoom.get(objects.chatRoom.idFromName(room));
  return stub.fetch(c.req.raw);
});
