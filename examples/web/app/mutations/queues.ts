import type { InferRequestType } from '@acme/client';
import { mutationOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

const $sendToQueue = apiClient.api.queues.send.$post;
const $deleteResult = apiClient.api.queues.results[':id'].$delete;

export function sendToQueueOptions() {
  return mutationOptions({
    mutationFn: (req: InferRequestType<typeof $sendToQueue>) => {
      return request($sendToQueue(req));
    },
  });
}

export function deleteQueueResultOptions() {
  return mutationOptions({
    mutationFn: (req: InferRequestType<typeof $deleteResult>) => {
      return request($deleteResult(req));
    },
  });
}
