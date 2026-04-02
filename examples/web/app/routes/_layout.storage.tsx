import { useState } from 'react';

import { Section } from '~/components/section';

type StorageObject = { key: string; size: string; uploaded: string };

const initialObjects: StorageObject[] = [
  { key: 'avatar.png', size: '184.8 KB', uploaded: '2026-04-01T09:00:00Z' },
  { key: 'report.pdf', size: '1.2 MB', uploaded: '2026-04-01T10:30:00Z' },
  { key: 'backup.sql', size: '42.5 KB', uploaded: '2026-04-01T14:15:00Z' },
];

export default function Storage() {
  const [objects, setObjects] = useState(initialObjects);

  function upload(e: React.FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const file = (form.elements.namedItem('file') as HTMLInputElement)
      .files?.[0];
    if (!file) {
      return;
    }
    setObjects([
      ...objects,
      {
        key: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        uploaded: new Date().toISOString(),
      },
    ]);
    form.reset();
  }

  function deleteObject(key: string) {
    setObjects(objects.filter((o) => o.key !== key));
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Upload File</Section.Heading>
      <form onSubmit={upload} className="flex gap-2 items-center">
        <input
          type="file"
          name="file"
          required
          className="text-xs font-pixel"
        />
        <button
          type="submit"
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90"
        >
          Upload
        </button>
      </form>

      <Section.Heading>Objects ({objects.length})</Section.Heading>
      <div className="border border-ink overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-ink font-mono">
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Key
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Size
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-white">
                Uploaded
              </th>
              <th className="px-2.5 py-1.5" />
            </tr>
          </thead>
          <tbody className="font-pixel">
            {objects.map((obj) => (
              <tr
                key={obj.key}
                className="border-b border-border last:border-0"
              >
                <td className="px-2.5 py-1.5">
                  <code>{obj.key}</code>
                </td>
                <td className="px-2.5 py-1.5 text-text-dim">{obj.size}</td>
                <td className="px-2.5 py-1.5 text-text-dim">
                  {new Date(obj.uploaded).toLocaleString()}
                </td>
                <td className="px-2.5 py-1.5 text-right">
                  <button
                    onClick={() => deleteObject(obj.key)}
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
