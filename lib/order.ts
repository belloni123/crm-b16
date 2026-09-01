export function assertExactOrder(currentIds: string[], orderedIds: string[], entityLabel: string) {
  const current = new Set(currentIds);
  const ordered = new Set(orderedIds);
  if (
    current.size !== currentIds.length
    || ordered.size !== orderedIds.length
    || orderedIds.length !== currentIds.length
    || orderedIds.some((id) => !current.has(id))
  ) {
    throw new Error(`A nova ordem precisa conter exatamente todos os ${entityLabel}.`);
  }
}
