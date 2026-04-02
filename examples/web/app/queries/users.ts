import { queryOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

export function userListOptions() {
  return queryOptions({
    queryKey: ['users'],
    queryFn: () => {
      return request(apiClient.api.users.$get());
    },
  });
}

export function userDetailOptions(id: string) {
  return queryOptions({
    queryKey: ['users', id],
    queryFn: () => {
      return request(
        apiClient.api.users[':id'].$get({
          param: { id },
        })
      );
    },
  });
}
