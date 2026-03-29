import type { QueueContext } from "make-void";

export const queueName = "EMAIL_QUEUE";

interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export default async function handler(ctx: QueueContext<EmailMessage>) {
  for (const message of ctx.batch.messages) {
    try {
      console.log(`Sending email to ${message.body.to}: ${message.body.subject}`);
      message.ack();
    } catch (error) {
      console.error("Failed to send email:", error);
      message.retry();
    }
  }
}
