import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Section } from '~/components/section';
import { apiClient } from '~/lib/api-client';
import { cn } from '~/utils/classname';

type RequestResult = { status: number; success: boolean } | null;

export default function RateLimit() {
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const statuses = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const res = await apiClient.api.auth.login.$post({});
          return res.status;
        })
      );
      return statuses.map((status) => ({ status, success: status === 200 }));
    },
  });

  const [results, setResults] = useState<RequestResult[]>(
    Array.from({ length: 10 }, () => null)
  );

  const fire = () => {
    mutate(undefined, {
      onSettled: (data) => {
        setResults(data ?? []);
      },
    });
  };

  return (
    <div className="space-y-6">
      <Section.Heading>Authentication Rate Limiter</Section.Heading>
      <p className="text-xs font-pixel text-text-dim italic">
        Fires 10 concurrent POST /api/auth/login requests. Limit is 60 req/60s —
        click twice quickly to see 429s.
      </p>
      <button
        onClick={fire}
        disabled={isPending}
        className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? 'Firing...' : 'Fire 10 Requests'}
      </button>
      <div className="flex flex-wrap gap-2">
        {results.map((result, i) => (
          <div
            key={i}
            className={cn(
              'w-14 h-14 border flex flex-col items-center justify-center gap-0.5',
              result === null
                ? 'border-border text-text-dim'
                : result.success
                  ? 'border-green-500 text-green-600'
                  : 'border-red-500 text-red-500'
            )}
          >
            <span className="text-sm">
              {result === null ? '·' : result.success ? '✓' : '✕'}
            </span>
            <span className="text-[10px] font-pixel">
              {result === null ? '—' : result.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
