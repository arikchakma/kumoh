import { defineQueue } from 'kumoh/queue';

type NotificationMessage = {
  to: string;
  subject: string;
  body: string;
};

export default defineQueue<NotificationMessage>(async (batch) => {
  for (const message of batch.messages) {
    try {
      console.log(
        `Sending notification to ${message.body.to}: ${message.body.subject}`
      );
      message.ack();
    } catch (error) {
      console.error('Failed to send notification:', error);
      message.retry();
    }
  }
});
