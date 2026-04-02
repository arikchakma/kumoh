import { queryOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

export function helloOptions() {
  return queryOptions({
    queryKey: ['hello'],
    queryFn: () => {
      return request(apiClient.api.hello.$get());
    },
  });
}
