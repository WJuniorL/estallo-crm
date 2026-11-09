/** Regra compartilhada pela ação de automação e pelo escritor transacional. */
export function prepararAdicaoDeTags(previous: readonly string[], requested: readonly string[]) {
  const added = requested.filter((tag) => !previous.includes(tag));
  return { added, tags: [...previous, ...added] };
}
