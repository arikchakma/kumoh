import { useState } from 'react';

import { Section } from '~/components/section';

type Note = {
  id: number;
  title: string;
  body: string;
  createdAt: string;
};

const initialNotes: Note[] = [
  {
    id: 1,
    title: 'First note',
    body: 'Hello from D1',
    createdAt: '2026-04-01T10:00:00Z',
  },
  {
    id: 2,
    title: 'Setup guide',
    body: 'Run kumoh init to get started',
    createdAt: '2026-04-01T11:30:00Z',
  },
  {
    id: 3,
    title: 'Deploy',
    body: 'kumoh deploy handles everything',
    createdAt: '2026-04-01T14:00:00Z',
  },
];

export default function DB() {
  const [notes, setNotes] = useState(initialNotes);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!title) {
      return;
    }
    setNotes([
      ...notes,
      {
        id: notes.length + 1,
        title,
        body,
        createdAt: new Date().toISOString(),
      },
    ]);
    setTitle('');
    setBody('');
  }

  function deleteNote(id: number) {
    setNotes(notes.filter((n) => n.id !== id));
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Add Note</Section.Heading>
      <form onSubmit={addNote} className="flex gap-2">
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="border border-border h-7 px-2 text-xs font-pixel flex-1"
        />
        <input
          type="text"
          placeholder="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="border border-border h-7 px-2 text-xs font-pixel flex-1"
        />
        <button
          type="submit"
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90"
        >
          Add
        </button>
      </form>

      <Section.Heading>Notes ({notes.length})</Section.Heading>
      <div className="border border-ink overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-ink font-mono">
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                ID
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Title
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Body
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Created
              </th>
              <th className="px-2.5 py-1.5" />
            </tr>
          </thead>
          <tbody className="font-pixel">
            {notes.map((note) => (
              <tr
                key={note.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-2.5 py-1.5 text-text-dim">{note.id}</td>
                <td className="px-2.5 py-1.5">{note.title}</td>
                <td className="px-2.5 py-1.5 text-text-dim">{note.body}</td>
                <td className="px-2.5 py-1.5 text-text-dim">
                  {new Date(note.createdAt).toLocaleString()}
                </td>
                <td className="px-2.5 py-1.5 text-right">
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="text-text-dim hover:text-red-500"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
