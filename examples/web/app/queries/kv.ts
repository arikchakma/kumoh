import { queryOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

export function kvListOptions() {
  return queryOptions({
    queryKey: ['kv'],
    queryFn: () => {
      return request(apiClient.api.kv.$get());
    },
  });
}

export function kvGetOptions(key: string) {
  return queryOptions({
    queryKey: ['kv', key],
    queryFn: () => {
      return request(
        apiClient.api.kv[':key'].$get({
          param: { key },
        })
      );
    },
    enabled: key.length > 0,
  });
}
