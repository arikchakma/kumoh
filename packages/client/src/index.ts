import type { AppType } from '@acme/api/rpc';
import { hc } from 'hono/client';

export type { InferRequestType, InferResponseType } from 'hono/client';

const client = hc<AppType>('');
export type Client = typeof client;

export const hcWithType = (...args: Parameters<typeof hc>): Client =>
  hc<AppType>(...args);
