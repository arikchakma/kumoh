import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';

import { Section } from '~/components/section';
import { queryClient } from '~/lib/query-client';
import { deleteKvOptions, putKvOptions } from '~/mutations/kv';
import { kvGetOptions, kvListOptions } from '~/queries/kv';

export async function clientLoader() {
  await queryClient.ensureQueryData(kvListOptions());
  return {};
}

export default function KV() {
  const qc = useQueryClient();
  const kvKey = kvListOptions().queryKey;

  const { data } = useSuspenseQuery(kvListOptions());

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [lookupKey, setLookupKey] = useState('');
  const [lookupSubmitted, setLookupSubmitted] = useState('');

  const { data: lookupResult, error: lookupError } = useQuery({
    ...kvGetOptions(lookupSubmitted),
    retry: false,
  });

  const putKv = useMutation({
    ...putKvOptions(),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: kvKey });
    },
  });

  const deleteKv = useMutation({
    ...deleteKvOptions(),
    onMutate: async (req) => {
      await qc.cancelQueries({ queryKey: kvKey });
      const previous = qc.getQueryData(kvKey);

      qc.setQueryData(kvKey, (old: typeof previous) => {
        if (!old) {
          return old;
        }
        return {
          ...old,
          keys: old.keys.filter((k) => k.name !== req.param.key),
        };
      });

      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        qc.setQueryData(kvKey, context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: kvKey });
    },
  });

  function handlePut(e: React.FormEvent) {
    e.preventDefault();
    if (!key || !value) {
      return;
    }
    putKv.mutate({ json: { key, value } });
    setKey('');
    setValue('');
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupSubmitted(lookupKey);
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Set Key</Section.Heading>
      <form onSubmit={handlePut} className="flex gap-2">
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
          disabled={putKv.isPending}
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-50"
        >
          Set
        </button>
      </form>

      <Section.Heading>Lookup Key</Section.Heading>
      <form onSubmit={handleLookup} className="flex gap-2">
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
      {lookupSubmitted && lookupResult && 'value' in lookupResult && (
        <p className="text-xs font-pixel text-text-dim">
          "{lookupSubmitted}" → "{lookupResult.value}"
        </p>
      )}
      {lookupSubmitted && lookupError && (
        <p className="text-xs font-pixel text-text-dim">
          "{lookupSubmitted}" → null
        </p>
      )}

      <Section.Heading>Keys ({data.keys.length})</Section.Heading>
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
            {data.keys.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-2.5 py-3 text-center text-text-dim"
                >
                  No keys yet
                </td>
              </tr>
            ) : (
              data.keys.map((entry) => (
                <tr
                  key={entry.name}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-2.5 py-1.5">
                    <code>{entry.name}</code>
                  </td>
                  <td className="px-2.5 py-1.5 text-text-dim">
                    {entry.expiration
                      ? new Date(entry.expiration * 1000).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    <button
                      onClick={() =>
                        deleteKv.mutate({ param: { key: entry.name } })
                      }
                      className="text-text-dim hover:text-red-500"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
