import { queryOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

export function emailsOptions() {
  return queryOptions({
    queryKey: ['emails'],
    queryFn: () => {
      return request(apiClient.api.email.$get());
    },
  });
}
