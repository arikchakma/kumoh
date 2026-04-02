type HasJson = { json(): Promise<unknown> };
type JsonOf<T extends HasJson> = Awaited<ReturnType<T['json']>>;

type ResponseType = Promise<{ ok: boolean; status: number } & HasJson>;
type RequestReturnType<R extends ResponseType> = Promise<JsonOf<Awaited<R>>>;

export async function request<R extends ResponseType>(
  res: R
): RequestReturnType<R> {
  const response = await res;
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: string }).error)
        : 'An unexpected error occurred'
    );
  }

  return data as RequestReturnType<R>;
}
