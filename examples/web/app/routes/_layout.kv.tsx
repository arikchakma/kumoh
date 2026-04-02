import { useState } from 'react';

import { Section } from '~/components/section';

type KVEntry = { key: string; expiration: string | null };

const initialKeys: KVEntry[] = [
  { key: 'session:abc123', expiration: null },
  { key: 'cache:homepage', expiration: '2026-04-02T00:00:00Z' },
  { key: 'rate:192.168.1.1', expiration: '2026-04-01T12:00:00Z' },
];

export default function KV() {
  const [keys, setKeys] = useState(initialKeys);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [lookupKey, setLookupKey] = useState('');
  const [lookupResult, setLookupResult] = useState<string | null>(null);

  function setKV(e: React.FormEvent) {
    e.preventDefault();
    if (!key || !value) {
      return;
    }
    setKeys([...keys.filter((k) => k.key !== key), { key, expiration: null }]);
    setKey('');
    setValue('');
  }

  function lookup(e: React.FormEvent) {
    e.preventDefault();
    const found = keys.find((k) => k.key === lookupKey);
    setLookupResult(
      found ? `"${lookupKey}" → (value stored)` : `"${lookupKey}" → null`
    );
  }

  function deleteKey(k: string) {
    setKeys(keys.filter((entry) => entry.key !== k));
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Set Key</Section.Heading>
      <form onSubmit={setKV} className="flex gap-2">
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
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90"
        >
          Set
        </button>
      </form>

      <Section.Heading>Lookup Key</Section.Heading>
      <form onSubmit={lookup} className="flex gap-2">
        <input
          type="text"
          placeholder="Key to look up"
          value={lookupKey}
          onChange={(e) => setLookupKey(e.target.value)}
          required
          className="border border-border h-7 px-2 text-xs font-pixel flex-1"
        />
        <button
          type="submit"
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90"
        >
          Get
        </button>
      </form>
      {lookupResult && (
        <p className="text-xs font-pixel text-text-dim">{lookupResult}</p>
      )}

      <Section.Heading>Keys ({keys.length})</Section.Heading>
      <div className="border border-ink overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-ink font-mono">
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Key
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Expiration
              </th>
              <th className="px-2.5 py-1.5" />
            </tr>
          </thead>
          <tbody className="font-pixel">
            {keys.map((entry) => (
              <tr
                key={entry.key}
                className="border-b border-border last:border-0"
              >
                <td className="px-2.5 py-1.5">
                  <code>{entry.key}</code>
                </td>
                <td className="px-2.5 py-1.5 text-text-dim">
                  {entry.expiration
                    ? new Date(entry.expiration).toLocaleString()
                    : '—'}
                </td>
                <td className="px-2.5 py-1.5 text-right">
                  <button
                    onClick={() => deleteKey(entry.key)}
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
