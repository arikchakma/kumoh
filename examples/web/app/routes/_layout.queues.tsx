import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';

import { Section } from '~/components/section';
import { queryClient } from '~/lib/query-client';
import {
  deleteQueueResultOptions,
  sendToQueueOptions,
} from '~/mutations/queues';
import { queueResultsOptions } from '~/queries/queues';

const PREDEFINED_ADDRESSES = [
  'contact@kumo.ooo',
  'hello@kumo.ooo',
  'support@kumo.ooo',
] as const;

export async function clientLoader() {
  await queryClient.ensureQueryData(queueResultsOptions());
  return {};
}

export default function Queues() {
  const qc = useQueryClient();
  const resultsKey = queueResultsOptions().queryKey;

  const { data: results } = useSuspenseQuery(queueResultsOptions());

  const [to, setTo] = useState<(typeof PREDEFINED_ADDRESSES)[number]>(
    PREDEFINED_ADDRESSES[0]
  );
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const sendToQueue = useMutation({
    ...sendToQueueOptions(),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: resultsKey });
    },
  });

  const deleteResult = useMutation({
    ...deleteQueueResultOptions(),
    onMutate: async (req) => {
      await qc.cancelQueries({ queryKey: resultsKey });
      const previous = qc.getQueryData(resultsKey);

      qc.setQueryData(resultsKey, (old: typeof previous) => {
        if (!old) {
          return old;
        }
        return old.filter((r) => r.id !== Number(req.param.id));
      });

      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        qc.setQueryData(resultsKey, context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: resultsKey });
    },
  });

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!subject || !body) {
      return;
    }
    sendToQueue.mutate({ json: { to, subject, body } });
    setSubject('');
    setBody('');
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Send to Queue</Section.Heading>
      <p className="text-xs font-pixel text-text-dim italic">
        Enqueues an email to the emails queue. The consumer sends it via
        Cloudflare Email and saves the result to D1.
      </p>
      <form onSubmit={handleSend} className="space-y-2">
        <select
          value={to}
          onChange={(e) =>
            setTo(e.target.value as (typeof PREDEFINED_ADDRESSES)[number])
          }
          className="border border-border h-7 px-2 text-xs font-pixel"
        >
          {PREDEFINED_ADDRESSES.map((addr) => (
            <option key={addr} value={addr}>
              {addr}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          className="border border-border h-7 px-2 text-xs font-pixel w-full"
        />
        <textarea
          placeholder="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={3}
          className="border border-border px-2 py-1.5 text-xs font-pixel w-full resize-none"
        />
        <button
          type="submit"
          disabled={sendToQueue.isPending}
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
        >
          {sendToQueue.isPending ? 'Queueing...' : 'Send to Queue'}
        </button>
      </form>

      <Section.Heading>Processed Results ({results.length})</Section.Heading>
      <p className="text-xs font-pixel text-text-dim italic">
        Emails consumed from the queue and sent via Cloudflare Email.
      </p>
      <div className="border border-ink overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-ink font-mono">
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                To
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Subject
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Processed
              </th>
              <th className="px-2.5 py-1.5" />
            </tr>
          </thead>
          <tbody className="font-pixel">
            {results.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-2.5 py-3 text-center text-text-dim"
                >
                  No results yet
                </td>
              </tr>
            ) : (
              results.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-2.5 py-1.5 text-text-dim">{r.to}</td>
                  <td className="px-2.5 py-1.5">{r.subject}</td>
                  <td className="px-2.5 py-1.5 text-text-dim whitespace-nowrap">
                    {new Date(r.processedAt).toLocaleString()}
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    <button
                      onClick={() =>
                        deleteResult.mutate({ param: { id: String(r.id) } })
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
