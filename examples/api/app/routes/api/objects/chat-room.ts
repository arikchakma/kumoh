import { defineHandler } from 'kumoh/app';
import { objects } from 'kumoh/objects';

export const GET = defineHandler(async (c) => {
  const room = c.req.query('room') ?? 'default';
  return objects.chatRoom.getByName(room).fetch(c.req.raw);
});
