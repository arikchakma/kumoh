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
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
        {results.length === 0 ? (
          <p className="px-3 py-4 text-center text-text-dim text-[11px] font-pixel">
            No results yet
          </p>
        ) : (
          <div className="divide-y divide-border">
            {results.map((r) => (
              <div key={r.id}>
                <div
                  className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-neutral-50"
                  onClick={() =>
                    setExpandedId(expandedId === r.id ? null : r.id)
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-pixel font-semibold truncate">
                        {r.subject}
                      </span>
                      <span className="text-[10px] font-pixel text-text-dim whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] font-pixel text-text-dim mt-0.5 truncate">
                      {r.from} → {r.to}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteResult.mutate({ param: { id: String(r.id) } });
                    }}
                    className="text-text-dim hover:text-red-500 text-xs shrink-0 mt-0.5"
                  >
                    ×
                  </button>
                </div>
                {expandedId === r.id && (
                  <div className="p-3 bg-neutral-50">
                    <pre className="text-[11px] font-pixel whitespace-pre-wrap break-words text-text-dim">
                      {r.body ?? '(no body)'}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
