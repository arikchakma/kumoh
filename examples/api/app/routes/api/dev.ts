import { defineHandler } from 'kumoh/app';

export const GET = defineHandler(async (c) => {
  return c.json({
    crons: [
      { schedule: '0 */6 * * *', name: 'heartbeat' },
      { schedule: '0 * * * *', name: 'cleanup' },
    ],
  });
});
