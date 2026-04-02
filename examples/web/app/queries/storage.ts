import { queryOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

export function storageListOptions() {
  return queryOptions({
    queryKey: ['storage'],
    queryFn: () => {
      return request(apiClient.api.storage.$get());
    },
  });
}
