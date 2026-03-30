export function generateCronModule(): string {
  return `
export function defineScheduled(handler) {
  return handler;
}
`;
}
