import { queryOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

export function queueResultsOptions() {
  return queryOptions({
    queryKey: ['queue-results'],
    queryFn: () => {
      return request(apiClient.api.queues.results.$get());
    },
  });
}
