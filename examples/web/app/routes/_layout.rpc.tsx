import { useState } from 'react';

import { CodeBlock } from '~/components/code-block';
import { Section } from '~/components/section';
import { apiClient } from '~/lib/api-client';

const clientCode = `import { hcWithType } from '@acme/client';

const client = hcWithType('http://localhost:5173');

// Fully typed — response shape inferred from handler
const res = await client.api.hello.$get();
const data = await res.json();
// data: { message: string; visits: number }

// Dynamic params typed
const userRes = await client.api.users[':id'].$get({
  param: { id: '123' },
});`;

type EndpointResult = {
  name: string;
  status: number | null;
  data: string | null;
  loading: boolean;
};

export default function RPC() {
  const [endpoints, setEndpoints] = useState<EndpointResult[]>([
    { name: 'GET /api/hello', status: null, data: null, loading: false },
    { name: 'GET /api/users', status: null, data: null, loading: false },
    { name: 'GET /api/users/:id', status: null, data: null, loading: false },
  ]);

  async function callEndpoint(index: number) {
    setEndpoints((prev) =>
      prev.map((ep, i) => (i === index ? { ...ep, loading: true } : ep))
    );

    try {
      let res: Response;

      switch (index) {
        case 0:
          res = await apiClient.api.hello.$get();
          break;
        case 1:
          res = await apiClient.api.users.$get();
          break;
        case 2:
          res = await apiClient.api.users[':id'].$get({
            param: { id: '1' },
          });
          break;
        default:
          return;
      }

      const data = await res.json();

      setEndpoints((prev) =>
        prev.map((ep, i) =>
          i === index
            ? {
                ...ep,
                loading: false,
                status: res.status,
                data: JSON.stringify(data, null, 2),
              }
            : ep
        )
      );
    } catch (err) {
      setEndpoints((prev) =>
        prev.map((ep, i) =>
          i === index
            ? {
                ...ep,
                loading: false,
                status: 0,
                data: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
              }
            : ep
        )
      );
    }
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Client Setup</Section.Heading>
      <CodeBlock code={clientCode} />

      <Section.Heading>Try It</Section.Heading>

      <div className="space-y-3">
        {endpoints.map((ep, i) => (
          <div key={ep.name} className="border border-border p-1.5">
            <div className="flex items-center justify-between">
              <code className="text-xs">{ep.name}</code>
              <button
                onClick={() => callEndpoint(i)}
                disabled={ep.loading}
                className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-50"
              >
                {ep.loading ? '...' : 'Call'}
              </button>
            </div>

            {ep.data && (
              <CodeBlock
                code={`// HTTP ${ep.status}\n${ep.data}`}
                className="mt-1.5"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
