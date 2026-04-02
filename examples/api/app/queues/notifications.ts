import { db, schema } from 'kumoh/db';
import { defineQueue } from 'kumoh/queue';

type NotificationMessage = {
  message: string;
};

export default defineQueue<NotificationMessage>(async (batch) => {
  for (const message of batch.messages) {
    try {
      await db.insert(schema.queueResults).values({
        queue: 'notifications',
        message: message.body.message,
        processedAt: new Date().toISOString(),
      });
      message.ack();
    } catch (error) {
      console.error('Failed to process notification:', error);
      message.retry();
    }
  }
});
