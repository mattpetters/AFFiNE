/**
 * @vitest-environment happy-dom
 */
import { CUSTOM_ICON_MAX_SIZE } from '@affine/component';
import { createAssetsArchive } from '@blocksuite/affine/widgets/linked-doc';
import { describe, expect, test } from 'vitest';

import { collectIconFiles } from './collect-icon-files';

const file = (name: string, type: string, size = 8) =>
  new File([new Uint8Array(size)], name, { type });

const zip = async (name: string, entries: Record<string, Blob>) => {
  const archive = await createAssetsArchive(
    new Map(Object.entries(entries)),
    Object.keys(entries)
  );
  return new File([await archive.generate()], name);
};

describe('collectIconFiles', () => {
  test('accepts supported images, the type comes from the extension', async () => {
    const { icons, skipped } = await collectIconFiles([
      file('a.png', 'image/png'),
      file('b.JPG', 'image/jpeg'),
      file('c.jpeg', ''),
      file('d.webp', 'image/webp'),
      file('e.gif', 'image/gif'),
      file('logo.v2.svg', 'image/svg+xml'),
    ]);

    expect(skipped).toEqual([]);
    expect(icons.map(icon => [icon.name, icon.blob.type])).toEqual([
      ['a', 'image/png'],
      ['b', 'image/jpeg'],
      ['c', 'image/jpeg'],
      ['d', 'image/webp'],
      ['e', 'image/gif'],
      ['logo.v2', 'image/svg+xml'],
    ]);
    expect(icons.every(icon => icon.pack === undefined)).toBe(true);
  });

  test('skips files that are not an image, empty or too large', async () => {
    const { icons, skipped } = await collectIconFiles([
      file('script.js', 'text/javascript'),
      file('page.html', 'text/html'),
      file('fake.png', 'text/html'),
      file('image.bmp', 'image/bmp'),
      file('noextension', 'image/png'),
      file('.png', 'image/png'),
      file('empty.png', 'image/png', 0),
      file('huge.png', 'image/png', CUSTOM_ICON_MAX_SIZE + 1),
      file('limit.png', 'image/png', CUSTOM_ICON_MAX_SIZE),
    ]);

    expect(icons.map(icon => icon.name)).toEqual(['limit']);
    expect(skipped).toEqual([
      'script.js',
      'page.html',
      'fake.png',
      'image.bmp',
      'noextension',
      '.png',
      'empty.png',
      'huge.png',
    ]);
  });

  test('caps an icon at 256 KB', async () => {
    expect(CUSTOM_ICON_MAX_SIZE).toBe(256 * 1024);

    const { icons, skipped } = await collectIconFiles([
      file('fits.png', 'image/png', 256 * 1024),
      file('over.png', 'image/png', 256 * 1024 + 1),
      file('one-megabyte.svg', 'image/svg+xml', 1024 * 1024),
    ]);

    expect(icons.map(icon => icon.name)).toEqual(['fits']);
    expect(skipped).toEqual(['over.png', 'one-megabyte.svg']);
  });

  test('expands zip archives into a pack named after the archive', async () => {
    const archive = await zip('Brand Icons.zip', {
      star: new Blob([new Uint8Array(4)], { type: 'image/png' }),
      logo: new Blob(['<svg/>'], { type: 'image/svg+xml' }),
      readme: new Blob(['hello'], { type: 'text/plain' }),
      huge: new Blob([new Uint8Array(CUSTOM_ICON_MAX_SIZE + 1)], {
        type: 'image/png',
      }),
    });

    const { icons, skipped } = await collectIconFiles([
      archive,
      file('single.png', 'image/png'),
    ]);

    expect(
      icons.map(icon => `${icon.pack}/${icon.name} ${icon.blob.type}`).sort()
    ).toEqual([
      'Brand Icons/logo image/svg+xml',
      'Brand Icons/star image/png',
      'undefined/single image/png',
    ]);
    expect(skipped.sort()).toEqual(['huge.png', 'readme.txt']);
  });

  test('skips archives that can not be read', async () => {
    const { icons, skipped } = await collectIconFiles([
      new File(['not a zip'], 'broken.zip'),
    ]);

    expect(icons).toEqual([]);
    expect(skipped).toEqual(['broken.zip']);
  });
});
