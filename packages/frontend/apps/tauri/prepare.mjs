import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));
const target = join(appDir, 'dist');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(join(appDir, '../web/dist'), target, {
  recursive: true,
  filter: source => !source.endsWith('.map'),
});
// Production source maps remain in web/dist for debugging, not in the app.
const entries = await readdir(target);
if (!entries.includes('index.html')) {
  throw new Error('Build @affine/web with PUBLIC_PATH=/ before packaging.');
}
