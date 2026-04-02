import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';

import { Section } from '~/components/section';
import { queryClient } from '~/lib/query-client';
import { createUserOptions, deleteUserOptions } from '~/mutations/users';
import { userListOptions } from '~/queries/users';

export async function clientLoader() {
  await queryClient.ensureQueryData(userListOptions());
  return {};
}

export default function DB() {
  const qc = useQueryClient();
  const usersKey = userListOptions().queryKey;

  const { data: users } = useSuspenseQuery(userListOptions());

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const createUser = useMutation({
    ...createUserOptions(),
    onMutate: async (req) => {
      await qc.cancelQueries({ queryKey: usersKey });
      const previous = qc.getQueryData(usersKey);

      qc.setQueryData(usersKey, (old: typeof previous) => {
        if (!old) {
          return old;
        }
        return [
          ...old,
          { id: Date.now(), name: req.json.name, email: req.json.email },
        ];
      });

      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        qc.setQueryData(usersKey, context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: usersKey });
    },
  });

  const deleteUser = useMutation({
    ...deleteUserOptions(),
    onMutate: async (req) => {
      await qc.cancelQueries({ queryKey: usersKey });
      const previous = qc.getQueryData(usersKey);

      qc.setQueryData(usersKey, (old: typeof previous) => {
        if (!old) {
          return old;
        }
        return old.filter((u) => u.id !== Number(req.param.id));
      });

      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        qc.setQueryData(usersKey, context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: usersKey });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email) {
      return;
    }
    createUser.mutate({ json: { name, email } });
    setName('');
    setEmail('');
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Add User</Section.Heading>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border border-border h-7 px-2 text-xs font-pixel flex-1"
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border border-border h-7 px-2 text-xs font-pixel flex-1"
        />
        <button
          type="submit"
          disabled={createUser.isPending}
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <Section.Heading>Users ({users.length})</Section.Heading>
      <div className="border border-ink overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-ink font-mono">
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                ID
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Name
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Email
              </th>
              <th className="px-2.5 py-1.5" />
            </tr>
          </thead>
          <tbody className="font-pixel">
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-2.5 py-3 text-center text-text-dim"
                >
                  No users yet
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-2.5 py-1.5 text-text-dim">{user.id}</td>
                  <td className="px-2.5 py-1.5">{user.name}</td>
                  <td className="px-2.5 py-1.5 text-text-dim">{user.email}</td>
                  <td className="px-2.5 py-1.5 text-right">
                    <button
                      onClick={() =>
                        deleteUser.mutate({ param: { id: String(user.id) } })
                      }
                      className="text-text-dim hover:text-red-500"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
