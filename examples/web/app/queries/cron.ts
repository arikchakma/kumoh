import { queryOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

export function cronHeartbeatOptions() {
  return queryOptions({
    queryKey: ['cron', 'heartbeat'],
    queryFn: () => {
      return request(apiClient.api.cron.heartbeat.$get());
    },
  });
}
