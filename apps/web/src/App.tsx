import { useEffect, useState } from 'react';

import { client } from './api';

function App() {
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState<unknown[]>([]);

  useEffect(() => {
    client.api.hello
      .$get()
      .then(async (res) => {
        const data = await res.json();
        setMessage(JSON.stringify(data));
      })
      .catch((err) => {
        console.error(err);
      });

    client.api.users
      .$get()
      .then(async (res) => {
        const data = await res.json();
        setUsers(data as unknown[]);
      })
      .catch((err) => {
        console.error(err);
      });
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>Kumoh RPC Test</h1>

      <h2>GET /api/hello</h2>
      <pre>{message || 'loading...'}</pre>

      <h2>GET /api/users</h2>
      <pre>{JSON.stringify(users, null, 2)}</pre>

      <h2>GET /api/users/:id</h2>
      <button
        onClick={async () => {
          const res = await client.api.users[':id'].$get({
            param: { id: '1' },
          });
          const data = await res.json();
          alert(JSON.stringify(data));
        }}
      >
        Fetch User 1
      </button>
    </div>
  );
}

export default App;
