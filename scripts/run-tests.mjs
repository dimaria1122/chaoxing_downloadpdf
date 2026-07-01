import { run } from 'node:test';
import process from 'node:process';

const stream = run({ files: ['tests/parser.test.mjs'] });
stream.on('test:fail', () => {
  process.exitCode = 1;
});
