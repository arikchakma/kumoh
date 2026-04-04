import { useSuspenseQuery } from '@tanstack/react-query';

import { Section } from '~/components/section';
import { queryClient } from '~/lib/query-client';
import { cronHeartbeatOptions } from '~/queries/cron';

export async function clientLoader() {
  await queryClient.ensureQueryData(cronHeartbeatOptions());
  return {};
}

export default function Cron() {
  const { data } = useSuspenseQuery(cronHeartbeatOptions());

  return (
    <div className="space-y-6">
      <Section.Heading>Last Heartbeat</Section.Heading>
      <p className="font-pixel text-xs text-text">
        <code>
          {data.lastHeartbeat
            ? new Date(data.lastHeartbeat).toLocaleString()
            : 'No heartbeat yet — cron has not run'}
        </code>
      </p>
      <p className="text-xs font-pixel text-text-dim italic">
        Stored in KV at <code>cron:last-heartbeat</code>. Runs every 6 hours.
      </p>
    </div>
  );
}
