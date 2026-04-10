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
  ...defaultTimestamps,
});

export const visits = sqliteTable('visits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path'),
  ...defaultTimestamps,
});

export const queueResults = sqliteTable('queue_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  queue: text('queue').notNull(),
  from: text('from').notNull(),
  to: text('to').notNull(),
  subject: text('subject').notNull(),
  body: text('body'),
  ...defaultTimestamps,
});

export const objects = sqliteTable('objects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull(),
  size: integer('size').notNull(),
  contentType: text('content_type').notNull(),
  ...defaultTimestamps,
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

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: text('room_id').notNull(),
  username: text('username').notNull(),
  text: text('text').notNull(),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});
