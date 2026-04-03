import { sql } from 'kumoh/db';
import { integer, sqliteTable, text } from 'kumoh/db';

export const defaultTimestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
};

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

export const visits = sqliteTable('visits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path'),
});

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  expiresAt: text('expires_at'),
});

export const queueResults = sqliteTable('queue_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  queue: text('queue').notNull(),
  message: text('message').notNull(),
  processedAt: text('processed_at').notNull(),
});

export const objects = sqliteTable('objects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull(),
  size: integer('size').notNull(),
  contentType: text('content_type').notNull(),
  uploadedAt: text('uploaded_at').notNull(),
});

export const emails = sqliteTable('emails', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  from: text('from').notNull(),
  to: text('to').notNull(),
  subject: text('subject').notNull().default(''),
  text: text('text'),
  html: text('html'),
  raw: text('raw'),
  ...defaultTimestamps,
});
