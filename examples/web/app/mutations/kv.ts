import type { InferRequestType } from '@acme/client';
import { mutationOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

const $putKv = apiClient.api.kv.$post;
const $deleteKv = apiClient.api.kv[':key'].$delete;

export function putKvOptions() {
  return mutationOptions({
    mutationFn: (req: InferRequestType<typeof $putKv>) => {
      return request($putKv(req));
    },
  });
}

export function deleteKvOptions() {
  return mutationOptions({
    mutationFn: (req: InferRequestType<typeof $deleteKv>) => {
      return request($deleteKv(req));
    },
  });
}
