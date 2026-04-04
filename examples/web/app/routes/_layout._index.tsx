import { useState } from 'react';
import { Link } from 'react-router';
import { highlight } from 'sugar-high';

const features = [
  { to: '/db', label: 'DB', description: 'D1 SQLite CRUD' },
  { to: '/kv', label: 'KV', description: 'Key-Value storage' },
  { to: '/storage', label: 'Storage', description: 'Object storage' },
  { to: '/cron', label: 'Cron', description: 'Scheduled jobs' },
  { to: '/queues', label: 'Queues', description: 'Message queues' },
  { to: '/email', label: 'Email', description: 'Send & Route emails' },
  { to: '/rpc', label: 'RPC', description: 'Type-safe API client' },
];

type FileNode = {
  name: string;
  path?: string;
  content?: string;
  children?: FileNode[];
};

const fileTree: FileNode = {
  name: 'app/',
  children: [
    {
      name: 'routes/',
      children: [
        {
          name: 'v1/',
          children: [
            {
              name: 'hello.ts',
              path: 'routes/v1/hello.ts',
              content: `import { defineHandler } from 'kumoh/app';

export const GET = defineHandler(async (c) => {
  return c.json({ message: 'Hello from kumoh!' });
});`,
            },
            {
              name: 'howdy.ts',
              path: 'routes/v1/howdy.ts',
              content: `import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.json({ message: 'Howdy!' }));
app.get('/:name', (c) => {
  return c.json({ message: \`Howdy, \${c.req.param('name')}!\` });
});

export default app;`,
            },
          ],
        },
      ],
    },
    {
      name: 'crons/',
      children: [
        {
          name: 'heartbeat.ts',
          path: 'crons/heartbeat.ts',
          content: `import { defineScheduled } from 'kumoh/cron';
import { kv } from 'kumoh/kv';

export const cron = '0 */6 * * *';

export default defineScheduled(async () => {
  await kv.put('cron:last-run', new Date().toISOString());
});`,
        },
        {
          name: 'cleanup.ts',
          path: 'crons/cleanup.ts',
          content: `import { defineScheduled } from 'kumoh/cron';
import { db, lt, schema } from 'kumoh/db';

export const cron = '0 0 * * *';

export default defineScheduled(async () => {
  const yesterday = new Date(Date.now() - 86400 * 1000);
  await db
    .delete(schema.sessions)
    .where(lt(schema.sessions.createdAt, yesterday));
});`,
        },
      ],
    },
    {
      name: 'queues/',
      children: [
        {
          name: 'emails.ts',
          path: 'queues/emails.ts',
          content: `import { defineQueue } from 'kumoh/queue';
import { email } from 'kumoh/email';

type OutboundEmail = {
  to: string;
  subject: string;
  body: string;
};

export default defineQueue<OutboundEmail>(async (batch) => {
  for (const msg of batch.messages) {
    await email.send({
      from: 'noreply@example.com',
      to: msg.body.to,
      subject: msg.body.subject,
      text: msg.body.body,
    });
    msg.ack();
  }
});`,
        },
      ],
    },
    {
      name: 'db/',
      children: [
        {
          name: 'schema.ts',
          path: 'db/schema.ts',
          content: `import { integer, sqliteTable, text } from 'kumoh/db';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
});`,
        },
      ],
    },
    {
      name: 'server.ts',
      path: 'server.ts',
      content: `import { logger } from 'hono/logger';
import { defineApp } from 'kumoh/app';

export default defineApp((app) => {
  app.use(logger());
});
`,
    },
    {
      name: 'email.ts',
      path: 'email.ts',
      content: `import { defineEmail } from 'kumoh/email';

export default defineEmail(async (message) => {
  console.log(\`Email from \${message.from} to \${message.to}\`);
  // handle inbound email
});`,
    },
  ],
};

const serverTs = fileTree.children!.find((n) => n.path === 'server.ts')!;
const defaultFile = { path: serverTs.path!, content: serverTs.content! };

function TreeItem({
  node,
  depth = 0,
  selected,
  onSelect,
}: {
  node: FileNode;
  depth?: number;
  selected: string | null;
  onSelect: (path: string, content: string) => void;
}) {
  const isDir = node.children !== undefined;
  const [open, setOpen] = useState(depth === 0);

  if (isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ paddingLeft: 8 + depth * 12 }}
          className="w-full text-left flex items-center gap-1.5 py-0.5 pr-2 text-[11px] font-mono hover:bg-neutral-50 text-ink"
        >
          <span className="text-text-dim text-[9px] w-2 shrink-0">
            {open ? '▾' : '▸'}
          </span>
          {node.name}
        </button>
        {open &&
          node.children!.map((child, i) => (
            <TreeItem
              key={i}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
      </div>
    );
  }

  const isSelected = selected === node.path;
  return (
    <button
      onClick={() =>
        node.path &&
        node.content !== undefined &&
        onSelect(node.path, node.content)
      }
      style={{ paddingLeft: 8 + depth * 12 }}
      className={`w-full text-left flex items-center gap-1.5 py-0.5 pr-2 text-[11px] font-mono ${
        isSelected
          ? 'bg-ink text-white'
          : 'text-text-dim hover:bg-neutral-50 hover:text-ink'
      }`}
    >
      <span className="w-2 shrink-0" />
      {node.name}
    </button>
  );
}

export default function Home() {
  const [selected, setSelected] = useState(defaultFile);

  return (
    <div className="space-y-4">
      <ul className="space-y-1 font-pixel text-sm">
        {features.map((f) => (
          <li key={f.to}>
            <Link to={f.to} className="text-ink hover:opacity-70">
              {f.label}
            </Link>
            <span className="text-text-dim"> — {f.description}</span>
          </li>
        ))}
      </ul>

      <p className="font-mono text-xs text-text-dim leading-relaxed max-w-sm">
        A personal, opinionated API framework built on{' '}
        <span className="text-ink">Hono</span> and{' '}
        <span className="text-ink">Cloudflare Infrastructure</span>. Heavily
        inspired by{' '}
        <a
          href="https://void.cloud"
          target="_blank"
          rel="noreferrer"
          className="text-ink underline underline-offset-2 hover:opacity-70"
        >
          void.cloud
        </a>{' '}
        by voidzero.
      </p>

      <div className="border border-ink flex overflow-hidden h-80">
        <div className="w-44 border-r border-border overflow-y-auto py-1.5 shrink-0 scrollbar-none">
          <TreeItem
            node={fileTree}
            selected={selected.path}
            onSelect={(path, content) => setSelected({ path, content })}
          />
        </div>
        <div className="flex-1 overflow-auto bg-neutral-50/10 scrollbar-none flex flex-col">
          <div className="px-3 py-1.5 border-b border-border text-[10px] font-mono text-text-dim shrink-0">
            {selected.path}
          </div>
          <pre className="m-0 p-3 overflow-x-auto h-full">
            <code
              className="font-mono text-[11px] leading-relaxed"
              dangerouslySetInnerHTML={{ __html: highlight(selected.content) }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
}
