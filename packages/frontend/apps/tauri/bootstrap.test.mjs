import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('./src-tauri/bootstrap.js', import.meta.url),
  'utf8'
);

function boot(origin, storage) {
  const context = vm.createContext({
    location: { origin },
    navigator: { storage },
    localStorage: { setItem() {} },
  });
  vm.runInContext(source, context);
  return context;
}

test('native identity is only supplied to the bundled app origin', () => {
  assert.equal(boot('https://www.youtube.com', {}).__AFFINE_TAURI__, undefined);
  assert.equal(boot('http://127.0.0.1:47861', {}).__AFFINE_TAURI__, true);
});

test('reports a denied persistence request without claiming protection', async () => {
  const result = boot('http://127.0.0.1:47861', {
    persisted: async () => false,
    persist: async () => false,
  });
  assert.equal(await result.__AFFINE_TAURI_STORAGE_PERSISTENCE__, false);
});

test('existing persistent storage does not need a new request', async () => {
  const result = boot('http://127.0.0.1:47861', {
    persisted: async () => true,
    persist: () => {
      throw new Error('unexpected request');
    },
  });
  assert.equal(await result.__AFFINE_TAURI_STORAGE_PERSISTENCE__, true);
});

test('unsupported persistence remains unknown', async () => {
  const result = boot('http://127.0.0.1:47861', {});
  assert.equal(await result.__AFFINE_TAURI_STORAGE_PERSISTENCE__, null);
});
