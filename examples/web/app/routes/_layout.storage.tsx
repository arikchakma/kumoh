import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';

import { Section } from '~/components/section';
import { apiClient } from '~/lib/api-client';
import { queryClient } from '~/lib/query-client';
import { uploadFile } from '~/lib/upload';
import type { UploadProgress } from '~/lib/upload';
import { deleteObjectOptions } from '~/mutations/storage';
import { storageListOptions } from '~/queries/storage';

export async function clientLoader() {
  await queryClient.ensureQueryData(storageListOptions());
  return {};
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function Storage() {
  const qc = useQueryClient();
  const listKey = storageListOptions().queryKey;
  const { data } = useSuspenseQuery(storageListOptions());

  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null
  );

  const deleteObject = useMutation({
    ...deleteObjectOptions(),
    onMutate: async (req) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData(listKey);

      qc.setQueryData(listKey, (old: typeof previous) => {
        if (!old) {
          return old;
        }
        return {
          ...old,
          objects: old.objects.filter((o) => String(o.id) !== req.param.id),
        };
      });

      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        qc.setQueryData(listKey, context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: listKey });
    },
  });

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const file = (form.elements.namedItem('file') as HTMLInputElement)
      .files?.[0];
    if (!file) {
      return;
    }

    const url = apiClient.api.storage.$url().toString();
    const { promise } = uploadFile({
      url,
      file,
      onProgress: setUploadProgress,
    });

    try {
      await promise;
      void qc.invalidateQueries({ queryKey: listKey });
      form.reset();
    } finally {
      setUploadProgress(null);
    }
  }

  return (
    <div className="space-y-6">
      <Section.Heading>Upload File</Section.Heading>
      <form onSubmit={handleUpload} className="flex gap-2 items-center">
        <input
          type="file"
          name="file"
          required
          className="text-xs font-pixel"
        />
        <button
          type="submit"
          disabled={uploadProgress?.status === 'uploading'}
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-50"
        >
          Upload
        </button>
      </form>
      {uploadProgress && uploadProgress.status === 'uploading' && (
        <div>
          <div className="h-1.5 bg-border overflow-hidden">
            <div
              className="h-full bg-ink transition-all duration-150"
              style={{ width: `${uploadProgress.progress}%` }}
            />
          </div>
          <p className="text-[10px] font-pixel text-text-dim mt-1">
            {uploadProgress.progress}% ({formatBytes(uploadProgress.loaded)} /{' '}
            {formatBytes(uploadProgress.total)})
          </p>
        </div>
      )}

      <Section.Heading>Objects ({data.objects.length})</Section.Heading>
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
            {data.objects.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-2.5 py-3 text-center text-text-dim"
                >
                  No objects yet
                </td>
              </tr>
            ) : (
              data.objects.map((obj) => (
                <tr
                  key={obj.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-2.5 py-1.5">
                    <code>{obj.key}</code>
                  </td>
                  <td className="px-2.5 py-1.5 text-text-dim">
                    {formatBytes(obj.size)}
                  </td>
                  <td className="px-2.5 py-1.5 text-text-dim">
                    {new Date(obj.uploadedAt).toLocaleString()}
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    <button
                      onClick={() =>
                        deleteObject.mutate({ param: { id: String(obj.id) } })
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
