import type { InferRequestType } from '@acme/client';
import { mutationOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

const $deleteObject = apiClient.api.storage[':id'].$delete;

export function deleteObjectOptions() {
  return mutationOptions({
    mutationFn: (req: InferRequestType<typeof $deleteObject>) => {
      return request($deleteObject(req));
    },
  });
}
