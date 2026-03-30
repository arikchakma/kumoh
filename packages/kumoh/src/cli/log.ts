export const log = {
  step: (msg: string) => console.log(`\n◇ ${msg}`),
  ok: (msg: string) => console.log(`  ✓ ${msg}`),
  done: (msg: string) => console.log(`\n✓ ${msg}`),
  warn: (msg: string) => console.log(`  ⚠ ${msg}`),
};
