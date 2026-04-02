import { Link } from 'react-router';

const features = [
  { to: '/db', label: 'DB', description: 'D1 SQLite CRUD' },
  { to: '/kv', label: 'KV', description: 'Key-Value storage' },
  { to: '/storage', label: 'Storage', description: 'Object storage' },
  { to: '/cron', label: 'Cron', description: 'Scheduled jobs' },
  { to: '/queues', label: 'Queues', description: 'Message queues' },
  { to: '/rpc', label: 'RPC', description: 'Type-safe API client' },
];

export default function Home() {
  return (
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
  );
}
