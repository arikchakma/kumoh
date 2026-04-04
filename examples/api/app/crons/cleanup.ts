import { defineScheduled } from 'kumoh/cron';
import { db, lt, schema } from 'kumoh/db';
import { storage } from 'kumoh/storage';

export const cron = '0 * * * *';

export default defineScheduled(async () => {
  const oneHourAgo = new Date(Date.now() - 3600 * 1000);

  await db.delete(schema.emails).where(lt(schema.emails.createdAt, oneHourAgo));
  await db
    .delete(schema.queueResults)
    .where(lt(schema.queueResults.createdAt, oneHourAgo));
  await db.delete(schema.users).where(lt(schema.users.createdAt, oneHourAgo));
  await db.delete(schema.visits).where(lt(schema.visits.createdAt, oneHourAgo));

  // Objects — delete from R2 first, then D1
  const oldObjects = await db
    .select({ key: schema.objects.key })
    .from(schema.objects)
    .where(lt(schema.objects.createdAt, oneHourAgo));
  for (const obj of oldObjects) {
    await storage.delete(obj.key);
  }
  if (oldObjects.length) {
    await db
      .delete(schema.objects)
      .where(lt(schema.objects.createdAt, oneHourAgo));
  }

  console.log('Cleanup complete');
});
