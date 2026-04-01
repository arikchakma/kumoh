import { hc } from 'hono/client';

import type { AppType } from '../../api/.kumoh/rpc';

export const client = hc<AppType>('http://localhost:5173');
