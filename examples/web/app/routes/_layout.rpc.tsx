import { useState } from 'react';

import { CodeBlock } from '~/components/code-block';
import { Section } from '~/components/section';

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

  function callEndpoint(index: number) {
    setEndpoints((prev) =>
      prev.map((ep, i) => (i === index ? { ...ep, loading: true } : ep))
    );

    setTimeout(() => {
      const responses = [
        {
          status: 200,
          data: '{ "message": "Hello from Kumoh!", "visits": 42 }',
        },
        {
          status: 200,
          data: '[{ "id": 1, "name": "Alice", "email": "alice@test.com" }]',
        },
        { status: 404, data: '{ "error": "User not found: 123" }' },
      ];

      setEndpoints((prev) =>
        prev.map((ep, i) =>
          i === index ? { ...ep, loading: false, ...responses[i] } : ep
        )
      );
    }, 500);
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
