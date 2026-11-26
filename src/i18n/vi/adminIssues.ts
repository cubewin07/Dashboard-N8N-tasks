// P10-T02 · One message per `ConfigIssueCode` (src/domain/validateConfig.ts); {params} filled with fmt().
export const adminIssues = {
  codes: {
    schema: 'Dữ liệu chưa đúng dạng ({message}).',
  } as Record<string, string>,
}
