import { createInterface } from 'node:readline';

export function prompt(question: string, fallback: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (${fallback}): `, (answer) => {
      rl.close();
      resolve(answer.trim() || fallback);
    });
  });
}

export function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function confirmWithInput(
  message: string,
  expected: string
): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\n${message}: `, (answer) => {
      rl.close();
      resolve(answer.trim() === expected);
    });
  });
}
