import { useState } from 'react';

import { Section } from '~/components/section';

type QueueResult = {
  id: number;
  key: string;
  value: string;
  createdAt: string;
};

const initialResults: QueueResult[] = [
  {
    id: 1,
    key: 'welcome',
    value: 'Hello from queue',
    createdAt: '2026-04-01T10:00:00Z',
  },
  {
    id: 2,
    key: 'notify',
    value: 'User signed up',
    createdAt: '2026-04-01T11:00:00Z',
  },
];

export default function Queues() {
  const [results, setResults] = useState(initialResults);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!key || !value) {
      return;
    }
    setResults([
      ...results,
      {
        id: results.length + 1,
        key,
        value,
        createdAt: new Date().toISOString(),
      },
    ]);
    setKey('');
    setValue('');
  }

  function deleteResult(id: number) {
    setResults(results.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Send Message</Section.Heading>
      <form onSubmit={send} className="flex gap-2">
        <input
          type="text"
          placeholder="my-key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
          className="border border-border h-7 px-2 text-xs font-pixel flex-1"
        />
        <input
          type="text"
          placeholder="my-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          className="border border-border h-7 px-2 text-xs font-pixel flex-1"
        />
        <button
          type="submit"
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90 whitespace-nowrap"
        >
          Send to Queue
        </button>
      </form>

      <Section.Heading>Processed Results ({results.length})</Section.Heading>
      <p className="text-xs font-pixel text-text-dim italic">
        Messages consumed from the queue are written to D1 via the consumer.
      </p>
      <div className="border border-ink overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-ink font-mono">
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Key
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Value
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Created
              </th>
              <th className="px-2.5 py-1.5" />
            </tr>
          </thead>
          <tbody className="font-pixel">
            {results.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-2.5 py-1.5">
                  <code>{r.key}</code>
                </td>
                <td className="px-2.5 py-1.5">
                  <code>{r.value}</code>
                </td>
                <td className="px-2.5 py-1.5 text-text-dim">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-2.5 py-1.5 text-right">
                  <button
                    onClick={() => deleteResult(r.id)}
                    className="text-text-dim hover:text-red-500"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
