/** URL de la app para abrir una evidencia privada (vía API autenticada). */
export function evidenceFileHref(executionId: string, pathname: string) {
  const params = new URLSearchParams({ pathname });
  return `/api/executions/${executionId}/evidence/file?${params.toString()}`;
}
