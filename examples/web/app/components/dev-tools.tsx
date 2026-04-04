import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';
import { queueResultsOptions } from '~/queries/queues';

const API_URL = 'http://localhost:5173';

function buildMime(from: string, to: string, subject: string, body: string) {
  return [
    `From: <${from}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="utf-8"',
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@dev.local>`,
    '',
    body,
  ].join('\r\n');
}

async function triggerCron(schedule: string) {
  const url = `${API_URL}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent(schedule)}`;
  const res = await fetch(url, { method: 'POST' });
  return res.ok;
}

async function routeEmail(
  from: string,
  to: string,
  subject: string,
  body: string
) {
  const url = new URL(`${API_URL}/cdn-cgi/handler/email`);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  const res = await fetch(url, {
    method: 'POST',
    body: buildMime(from, to, subject, body),
  });
  return res.ok;
}

function StatusBadge({ status }: { status: string }) {
  if (!status) {
    return null;
  }
  const isOk = status === 'done' || status === 'routed';
  const isFail = status === 'failed';
  return (
    <span
      className={`text-[10px] font-mono ${isOk ? 'text-emerald-600' : isFail ? 'text-red-500' : 'text-text-dim'}`}
    >
      {status}
    </span>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-neutral-100 animate-pulse ${className ?? ''}`} />;
}

function CronSkeleton() {
  return (
    <div className="border border-border px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-2.5 w-36" />
        <Skeleton className="h-5 w-14" />
      </div>
    </div>
  );
}

function RouteSkeleton() {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-2">
      <div className="min-w-0 flex-1 space-y-1">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-44" />
      </div>
      <Skeleton className="h-5 w-14 shrink-0" />
    </div>
  );
}

const inputClass =
  'border border-border h-7 px-2 text-[11px] font-mono w-full bg-white focus:border-ink focus:outline-none';
const btnClass =
  'bg-ink text-white px-2 py-0.5 text-[10px] font-mono hover:opacity-80';

export function DevTools() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'crons' | 'route' | 'compose'>('crons');

  const [cronStatus, setCronStatus] = useState<Record<string, string>>({});
  const [from, setFrom] = useState('test@example.com');
  const [to, setTo] = useState('contact@kumo.ooo');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [composeStatus, setComposeStatus] = useState('');
  const [routeStatus, setRouteStatus] = useState<Record<number, string>>({});

  const { data: devInfo } = useQuery({
    queryKey: ['__dev'],
    queryFn: () => request(apiClient.api.dev.$get()),
    enabled: open,
  });

  const { data: queueResults } = useQuery({
    ...queueResultsOptions(),
    enabled: open && tab === 'route',
  });

  async function handleTriggerCron(schedule: string) {
    setCronStatus((s) => ({ ...s, [schedule]: 'running...' }));
    const ok = await triggerCron(schedule);
    setCronStatus((s) => ({ ...s, [schedule]: ok ? 'done' : 'failed' }));
    setTimeout(() => setCronStatus((s) => ({ ...s, [schedule]: '' })), 2000);
  }

  async function handleRouteEmail(
    id: number,
    from: string,
    to: string,
    subject: string,
    body: string
  ) {
    setRouteStatus((s) => ({ ...s, [id]: 'routing...' }));
    const ok = await routeEmail(from, to, subject, body || '');
    setRouteStatus((s) => ({ ...s, [id]: ok ? 'routed' : 'failed' }));
    setTimeout(() => setRouteStatus((s) => ({ ...s, [id]: '' })), 2000);
  }

  async function handleCompose(e: React.FormEvent) {
    e.preventDefault();
    if (!subject) {
      return;
    }
    setComposeStatus('sending...');
    const ok = await routeEmail(from, to, subject, body);
    setComposeStatus(ok ? 'routed' : 'failed');
    if (ok) {
      setSubject('');
      setBody('');
    }
    setTimeout(() => setComposeStatus(''), 2000);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-3 right-3 z-50 border border-border bg-white text-ink text-[10px] font-mono px-2.5 py-1 hover:bg-neutral-50"
      >
        Dev
      </button>
    );
  }

  const tabs = [
    { key: 'crons' as const, label: 'Crons' },
    { key: 'route' as const, label: 'Email Routing' },
    { key: 'compose' as const, label: 'Compose' },
  ];

  return (
    <div className="fixed bottom-3 right-3 z-50 w-[340px] min-h-[250px] bg-white border border-ink font-mono text-[11px]">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-ink bg-neutral-50">
        <span className="text-[10px] text-text-dim">
          Dev Tools — <code className="text-ink">{API_URL}</code>
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-text-dim hover:text-ink text-xs leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex text-[10px] border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-2 py-1.5 text-center font-mono ${
              tab === t.key
                ? 'border-b border-ink text-ink -mb-px'
                : 'text-text-dim hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-h-64 overflow-y-auto">
        {tab === 'crons' && (
          <div className="p-2.5 space-y-1.5">
            {devInfo?.crons?.map((cron) => (
              <div
                key={cron.schedule}
                className="border border-border px-2.5 py-2 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px]">{cron.name}</span>
                  <code className="text-[10px] text-text-dim">
                    {cron.schedule}
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <code className="text-[9px] text-text-dim truncate">
                    /cdn-cgi/handler/scheduled
                  </code>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={cronStatus[cron.schedule]} />
                    <button
                      onClick={() => handleTriggerCron(cron.schedule)}
                      className={btnClass}
                    >
                      Trigger
                    </button>
                  </div>
                </div>
              </div>
            )) ?? (
              <div className="space-y-1.5">
                <CronSkeleton />
                <CronSkeleton />
              </div>
            )}
          </div>
        )}

        {tab === 'route' && (
          <div className="divide-y divide-border">
            {!queueResults && (
              <>
                <RouteSkeleton />
                <RouteSkeleton />
                <RouteSkeleton />
              </>
            )}
            {queueResults?.length === 0 && (
              <p className="text-text-dim text-center py-4">
                No queued emails yet
              </p>
            )}
            {queueResults?.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="text-[11px] truncate">{r.subject}</div>
                  <div className="text-[10px] text-text-dim truncate">
                    {r.from} → {r.to}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={routeStatus[r.id]} />
                  <button
                    onClick={() =>
                      handleRouteEmail(
                        r.id,
                        r.from,
                        r.to,
                        r.subject,
                        r.body ?? ''
                      )
                    }
                    className={btnClass}
                  >
                    Route
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'compose' && (
          <form onSubmit={handleCompose} className="p-2.5 space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="email"
                placeholder="From"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
                className={inputClass}
              />
              <input
                type="email"
                placeholder="To"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <input
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className={inputClass}
            />
            <textarea
              placeholder="Body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className={`${inputClass} h-auto py-1.5 resize-none`}
            />
            <div className="flex items-center gap-2">
              <button type="submit" className={btnClass}>
                Route Inbound
              </button>
              <StatusBadge status={composeStatus} />
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
