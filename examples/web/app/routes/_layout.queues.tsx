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

export async function clientLoader() {
  await queryClient.ensureQueryData(queueResultsOptions());
  return {};
}

export default function Queues() {
  const qc = useQueryClient();
  const resultsKey = queueResultsOptions().queryKey;

  const { data: results } = useSuspenseQuery(queueResultsOptions());

  const [queueName, setQueueName] = useState<'notifications' | 'email'>(
    'notifications'
  );
  const [message, setMessage] = useState('');

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
    if (!message) {
      return;
    }
    sendToQueue.mutate({ json: { queue: queueName, message } });
    setMessage('');
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Send Message</Section.Heading>
      <form onSubmit={handleSend} className="flex gap-2">
        <select
          value={queueName}
          onChange={(e) =>
            setQueueName(e.target.value as 'notifications' | 'email')
          }
          className="border border-border h-7 px-2 text-xs font-pixel"
        >
          <option value="notifications">notifications</option>
          <option value="email">email</option>
        </select>
        <input
          type="text"
          placeholder="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          className="border border-border h-7 px-2 text-xs font-pixel flex-1"
        />
        <button
          type="submit"
          disabled={sendToQueue.isPending}
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
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
                Queue
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Message
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
                  <td className="px-2.5 py-1.5">
                    <code>{r.queue}</code>
                  </td>
                  <td className="px-2.5 py-1.5">{r.message}</td>
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
