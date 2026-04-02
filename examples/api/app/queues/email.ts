import { db, schema } from 'kumoh/db';
import { defineQueue } from 'kumoh/queue';

type EmailMessage = {
  message: string;
};

export default defineQueue<EmailMessage>(async (batch) => {
  for (const message of batch.messages) {
    try {
      await db.insert(schema.queueResults).values({
        queue: 'email',
        message: message.body.message,
        processedAt: new Date().toISOString(),
      });
      message.ack();
    } catch (error) {
      console.error('Failed to process email:', error);
      message.retry();
    }
  }
});
