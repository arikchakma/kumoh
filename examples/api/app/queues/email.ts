import { defineQueue } from 'kumoh/queue';

interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export default defineQueue<EmailMessage>(async (batch) => {
  for (const message of batch.messages) {
    try {
      console.log(
        `Sending email to ${message.body.to}: ${message.body.subject}`
      );
      message.ack();
    } catch (error) {
      console.error('Failed to send email:', error);
      message.retry();
    }
  }
});
