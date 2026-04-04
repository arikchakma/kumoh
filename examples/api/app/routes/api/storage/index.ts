import { defineHandler } from 'kumoh/app';
import { db, desc, schema } from 'kumoh/db';
import { storage } from 'kumoh/storage';

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extension(name: string) {
  return name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
}

export const GET = defineHandler(async (c) => {
  const objects = await db
    .select()
    .from(schema.objects)
    .orderBy(desc(schema.objects.createdAt));

  return c.json({ objects });
});

export const POST = defineHandler(async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const prefix = crypto.randomUUID().slice(0, 8);
  const name = file.name.replace(/\.[^.]+$/, '');

  const ext = extension(file.name);
  const slug = slugify(name);
  const key = `${prefix}-${slug}${ext}`;

  await storage.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const row = {
    key,
    size: file.size,
    contentType: file.type || 'application/octet-stream',
  };

  await db.insert(schema.objects).values(row);

  return c.json({ ok: true, ...row });
});
