export type UploadProgress = {
  progress: number;
  loaded: number;
  total: number;
  status: 'idle' | 'uploading' | 'complete' | 'error';
};

type UploadOptions = {
  url: string;
  file: File;
  onProgress?: (state: UploadProgress) => void;
};

export function uploadFile<T = unknown>(
  options: UploadOptions
): {
  promise: Promise<T>;
  abort: () => void;
} {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('file', options.file);

  const promise = new Promise<T>((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && options.onProgress) {
        options.onProgress({
          progress: Math.round((e.loaded / e.total) * 100),
          loaded: e.loaded,
          total: e.total,
          status: 'uploading',
        });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.({
          progress: 100,
          loaded: options.file.size,
          total: options.file.size,
          status: 'complete',
        });
        resolve(JSON.parse(xhr.responseText));
      } else {
        options.onProgress?.({
          progress: 0,
          loaded: 0,
          total: options.file.size,
          status: 'error',
        });
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      options.onProgress?.({
        progress: 0,
        loaded: 0,
        total: options.file.size,
        status: 'error',
      });
      reject(new Error('Upload failed'));
    });

    xhr.open('POST', options.url);
    xhr.send(formData);
  });

  return { promise, abort: () => xhr.abort() };
}
