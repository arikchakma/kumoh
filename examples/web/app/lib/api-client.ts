import { hcWithType } from '@acme/client';

const baseUrl = import.meta.env.DEV
  ? 'http://localhost:5173'
  : 'https://api.kumoh.dev';
export const apiClient = hcWithType(baseUrl);
