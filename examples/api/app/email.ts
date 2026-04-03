import { db, schema } from 'kumoh/db';
import { defineEmail } from 'kumoh/email';
import { parse } from 'mime-kit';

export default defineEmail(async (message) => {
  const rawBuffer = await new Response(message.raw).arrayBuffer();
  const parsed = await parse(rawBuffer);
  const raw = new TextDecoder().decode(rawBuffer);

  await db.insert(schema.emails).values({
    from: parsed.from?.address ?? message.from,
    to: message.to,
    subject: parsed.subject ?? '(no subject)',
    text: parsed.text ?? null,
    html: parsed.html ?? null,
    raw,
  });
});
