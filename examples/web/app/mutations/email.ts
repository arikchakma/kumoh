import type { InferRequestType } from '@acme/client';
import { mutationOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

const $sendEmail = apiClient.api.email.$post;
const $deleteEmail = apiClient.api.email[':id'].$delete;

export function sendEmailOptions() {
  return mutationOptions({
    mutationFn: (req: InferRequestType<typeof $sendEmail>) => {
      return request($sendEmail(req));
    },
  });
}

export function deleteEmailOptions() {
  return mutationOptions({
    mutationFn: (req: InferRequestType<typeof $deleteEmail>) => {
      return request($deleteEmail(req));
    },
  });
}
