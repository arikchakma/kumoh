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
            <span className="text-xs font-pixel text-text-dim">Sent!</span>
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
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-ink font-mono">
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                From
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                To
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Subject
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Received
              </th>
              <th className="px-2.5 py-1.5" />
            </tr>
          </thead>
          <tbody className="font-pixel">
            {emails.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-2.5 py-3 text-center text-text-dim"
                >
                  No emails yet
                </td>
              </tr>
            ) : (
              emails.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className="border-b border-border last:border-0 cursor-pointer hover:bg-neutral-50"
                    onClick={() =>
                      setExpandedId(expandedId === entry.id ? null : entry.id)
                    }
                  >
                    <td className="px-2.5 py-1.5 text-text-dim">
                      {entry.from}
                    </td>
                    <td className="px-2.5 py-1.5 text-text-dim">{entry.to}</td>
                    <td className="px-2.5 py-1.5">{entry.subject}</td>
                    <td className="px-2.5 py-1.5 text-text-dim whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEmail.mutate({
                            param: { id: String(entry.id) },
                          });
                        }}
                        className="text-text-dim hover:text-red-500"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  {expandedId === entry.id && (
                    <tr
                      key={`${entry.id}-body`}
                      className="border-b border-border bg-neutral-50"
                    >
                      <td colSpan={5} className="px-2.5 py-3">
                        <pre className="text-[11px] font-pixel whitespace-pre-wrap break-words text-text-dim">
                          {entry.text ?? '(no plain text body)'}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
