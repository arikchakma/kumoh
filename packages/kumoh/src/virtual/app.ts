export function generateAppModule(): string {
  return [
    "import { createFactory } from 'hono/factory';",
    'export function defineApp(init) { return init; }',
    'export const defineHandler = createFactory().createHandlers;',
    'export function defineMiddleware(handler) { return handler; }',
  ].join('\n');
}
