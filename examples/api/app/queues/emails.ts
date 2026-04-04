import { db, schema } from 'kumoh/db';
import { email } from 'kumoh/email';
import { defineQueue } from 'kumoh/queue';

type OutboundEmail = {
  to: string;
  subject: string;
  body: string;
};

export default defineQueue<OutboundEmail>(async (batch) => {
  for (const msg of batch.messages) {
    try {
      const { to, subject, body } = msg.body;

      await email.send({ from: 'noreply@kumo.ooo', to, subject, text: body });
      await db.insert(schema.queueResults).values({
        queue: 'emails',
        from: 'noreply@kumo.ooo',
        to,
        subject,
        body,
      });

      msg.ack();
    } catch (error) {
      console.error('Failed to send email:', error);
      msg.retry();
    }
  }
});
