import type { InferRequestType } from '@acme/client';
import { mutationOptions } from '@tanstack/react-query';

import { apiClient } from '~/lib/api-client';
import { request } from '~/lib/http';

const $createUser = apiClient.api.users.$post;
const $updateUser = apiClient.api.users[':id'].$patch;
const $deleteUser = apiClient.api.users[':id'].$delete;

export function createUserOptions() {
  return mutationOptions({
    mutationFn: (req: InferRequestType<typeof $createUser>) => {
      return request($createUser(req));
    },
  });
}

export function updateUserOptions() {
  return mutationOptions({
    mutationFn: (req: InferRequestType<typeof $updateUser>) => {
      return request($updateUser(req));
    },
  });
}

export function deleteUserOptions() {
  return mutationOptions({
    mutationFn: (req: InferRequestType<typeof $deleteUser>) => {
      return request($deleteUser(req));
    },
  });
}
