/**
 * Wraps a DurableObjectNamespace with explicit, unambiguous methods.
 *
 * - `getByName(name, options?)` — get a stub by name
 * - `getById(id, options?)` — get a stub by DurableObjectId
 * - `idFromName(name)` — derive a DurableObjectId from a name
 * - `idFromString(id)` — reconstruct a DurableObjectId from a hex string
 * - `newUniqueId(options?)` — generate a new unique DurableObjectId
 */
export function wrapNamespace<
  T extends Rpc.DurableObjectBranded | undefined = undefined,
>(ns: DurableObjectNamespace<T>) {
  return {
    getByName: (
      name: string,
      options?: DurableObjectNamespaceGetDurableObjectOptions
    ) => ns.getByName(name, options),
    getById: (
      id: DurableObjectId,
      options?: DurableObjectNamespaceGetDurableObjectOptions
    ) => ns.get(id, options),
    idFromName: (name: string) => ns.idFromName(name),
    idFromString: (id: string) => ns.idFromString(id),
    newUniqueId: (options?: DurableObjectNamespaceNewUniqueIdOptions) =>
      ns.newUniqueId(options),
  };
}
