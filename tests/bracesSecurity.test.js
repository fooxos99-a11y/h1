import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const consumerRequire = createRequire(require.resolve('micromatch'));
const braces = consumerRequire('braces');

test('all Tailwind brace consumers resolve the reviewed depth-guard backport', () => {
  for (const consumer of ['chokidar', 'micromatch']) {
    const consumerRequire = createRequire(require.resolve(consumer));
    const metadata = consumerRequire('braces/package.json');
    assert.equal(metadata.name, '@dieub/braces-depth-guard');
    assert.equal(metadata.version, '3.0.3-pn.3');
  }
});

test('brace expansion preserves ordinary Tailwind glob and numeric-range behavior', () => {
  assert.deepEqual(braces.expand('./src/**/*.{js,jsx,ts,tsx}'), [
    './src/**/*.js', './src/**/*.jsx', './src/**/*.ts', './src/**/*.tsx',
  ]);
  assert.deepEqual(braces.expand('a{b,{c,d}}e'), ['abe', 'ace', 'ade']);
  assert.deepEqual(braces.expand('{01..03}'), ['01', '02', '03']);
  assert.deepEqual(braces.expand('\\{literal\\}'), ['{literal}']);
  assert.equal(braces.compile('file.{js,jsx}'), 'file.(js|jsx)');
});

test('deep input is rejected before exhausting the Node call stack', () => {
  const script = `const assert = require('node:assert/strict');
    const braces = require(process.argv[1]);
    for (const delimiter of [['{', '}'], ['(', ')']]) {
      const pattern = delimiter[0].repeat(4000) + 'a' + delimiter[1].repeat(4000);
      for (const operation of ['parse', 'compile', 'expand']) {
        assert.throws(() => braces[operation](pattern),
          error => error instanceof SyntaxError && /exceeds max depth/.test(error.message));
      }
    }`;
  const result = spawnSync(process.execPath, ['-e', script, consumerRequire.resolve('braces')], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('direct AST processors cannot bypass the depth guard', () => {
  for (const operation of ['compile', 'expand', 'stringify']) {
    let ast = { type: 'text', value: 'a' };
    for (let depth = 0; depth < 1000; depth += 1) {
      ast = { type: 'brace', nodes: [ast], commas: 0, ranges: 0 };
    }
    ast = { type: 'root', nodes: [ast] };
    assert.throws(() => braces[operation](ast),
      error => error instanceof RangeError && /exceeds max depth/.test(error.message));
  }
});

test('depth options retain the hard cap and honor stricter fractional limits', () => {
  const pattern = '{'.repeat(101) + 'a' + '}'.repeat(101);
  for (const maxDepth of [Infinity, NaN, 10000, '10000']) {
    assert.throws(() => braces.parse(pattern, { maxDepth }), /exceeds max depth/);
  }
  assert.doesNotThrow(() => braces.parse('{a}', { maxDepth: 1.5 }));
  assert.throws(() => braces.parse('{{a}}', { maxDepth: 1.5 }), /exceeds max depth/);
  assert.throws(() => braces.parse('{a}', { maxDepth: -1 }), /must be non-negative/);
  assert.throws(() => braces.parse('a'.repeat(10001), { maxLength: NaN }),
    /must be a non-negative number/);
});
