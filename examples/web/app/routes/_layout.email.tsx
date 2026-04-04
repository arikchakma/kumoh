import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';

import { Section } from '~/components/section';
import { queryClient } from '~/lib/query-client';
import { deleteEmailOptions, sendEmailOptions } from '~/mutations/email';
import { emailsOptions } from '~/queries/email';

const PREDEFINED_ADDRESSES = [
  'contact@kumo.ooo',
  'hello@kumo.ooo',
  'support@kumo.ooo',
] as const;

export async function clientLoader() {
  await queryClient.ensureQueryData(emailsOptions());
  return {};
}

export default function Email() {
  const qc = useQueryClient();
  const emailsKey = emailsOptions().queryKey;

  const { data: emails } = useSuspenseQuery(emailsOptions());

  const [to, setTo] = useState<(typeof PREDEFINED_ADDRESSES)[number]>(
    PREDEFINED_ADDRESSES[0]
  );
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sendEmail = useMutation({
    ...sendEmailOptions(),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: emailsKey });
    },
  });

  const deleteEmail = useMutation({
    ...deleteEmailOptions(),
    onMutate: async (req) => {
      await qc.cancelQueries({ queryKey: emailsKey });
      const previous = qc.getQueryData(emailsKey);

      qc.setQueryData(emailsKey, (old: typeof previous) => {
        if (!old) {
          return old;
        }
        return old.filter((e) => e.id !== Number(req.param.id));
      });

      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        qc.setQueryData(emailsKey, context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: emailsKey });
    },
  });

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!subject || !body) {
      return;
    }
    sendEmail.mutate({
      json: {
        to,
        subject,
        body,
      },
    });
    setSubject('');
    setBody('');
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Compose</Section.Heading>
      <p className="text-xs font-pixel text-text-dim italic">
        Sends an email to a predefined @kumo.ooo address via Cloudflare Email.
        Email Routing captures it and saves it to D1.
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
          rows={4}
          className="border border-border px-2 py-1.5 text-xs font-pixel w-full resize-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={sendEmail.isPending}
            className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-50"
          >
            {sendEmail.isPending ? 'Sending...' : 'Send'}
          </button>
          {sendEmail.isSuccess && (
            <span className="text-xs font-pixel text-text-dim">Queued!</span>
          )}
          {sendEmail.isError && (
            <span className="text-xs font-pixel text-red-500">
              Failed to send
            </span>
          )}
        </div>
      </form>

      <Section.Heading>Inbox ({emails.length})</Section.Heading>
      <div className="border border-ink overflow-hidden">
        {emails.length === 0 ? (
          <p className="px-3 py-4 text-center text-text-dim text-[11px] font-pixel">
            No emails yet
          </p>
        ) : (
          <div className="divide-y divide-border">
            {emails.map((entry) => (
              <div key={entry.id}>
                <div
                  className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-neutral-50"
                  onClick={() =>
                    setExpandedId(expandedId === entry.id ? null : entry.id)
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-pixel font-semibold truncate">
                        {entry.subject || '(no subject)'}
                      </span>
                      <span className="text-[10px] font-pixel text-text-dim whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] font-pixel text-text-dim mt-0.5 truncate">
                      {entry.from} → {entry.to}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteEmail.mutate({
                        param: { id: String(entry.id) },
                      });
                    }}
                    className="text-text-dim hover:text-red-500 text-xs shrink-0 mt-0.5"
                  >
                    ×
                  </button>
                </div>
                {expandedId === entry.id && (
                  <div className="p-3 bg-neutral-50">
                    <pre className="text-[11px] font-pixel whitespace-pre-wrap break-words text-text-dim">
                      {entry.text ?? '(no plain text body)'}
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
