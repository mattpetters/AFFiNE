/**
 * @vitest-environment happy-dom
 */
import { CUSTOM_ICON_MAX_SIZE } from '@affine/component';
import { createORMClient, Framework, YjsDBAdapter } from '@toeverything/infra';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { WorkspaceDBService } from '../../db';
import { AFFiNE_WORKSPACE_DB_SCHEMA } from '../../db/schema';
import { CustomIconStore } from '../store/custom-icon';
import { CustomIconService } from './custom-icon';

const image = (name: string, content = name) =>
  new File([content], name, { type: 'image/png' });

const setup = () => {
  const Client = createORMClient(AFFiNE_WORKSPACE_DB_SCHEMA);
  const docs = new Map<string, YDoc>();
  const db = new Client(
    new YjsDBAdapter(AFFiNE_WORKSPACE_DB_SCHEMA, {
      getDoc: guid => {
        const doc = new YDoc({ guid });
        docs.set(guid, doc);
        return doc;
      },
    })
  );

  const framework = new Framework();
  framework
    .service(WorkspaceDBService, { db } as unknown as WorkspaceDBService)
    .store(CustomIconStore, [WorkspaceDBService])
    .service(CustomIconService, [CustomIconStore]);

  return { service: framework.provider().get(CustomIconService), db, docs };
};

const mockObjectUrls = () => {
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation(() => `blob:url-${create.mock.calls.length}`);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
  return { create, revoke };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CustomIconService', () => {
  test('stores the image bytes of uploaded icons in the workspace db', async () => {
    const { service, db } = setup();

    const result = await service.upload(
      [image('b.png', 'bytes of b'), image('a.png'), new File(['x'], 'n.txt')],
      'Brand'
    );

    expect(result).toEqual({ added: 2, skipped: ['n.txt'] });
    expect(service.packs$.value).toEqual([
      {
        name: 'Brand',
        icons: [
          { id: expect.any(String), name: 'a' },
          { id: expect.any(String), name: 'b' },
        ],
      },
    ]);

    const [, b] = service.packs$.value[0].icons;
    expect(db.customIconData.find()).toHaveLength(2);
    expect(db.customIconData.get(b.id)).toEqual({
      id: b.id,
      mime: 'image/png',
      data: btoa('bytes of b'),
    });
  });

  test('never stores an image over the size limit', async () => {
    const { service, db } = setup();

    const result = await service.upload([
      new File([new Uint8Array(CUSTOM_ICON_MAX_SIZE + 1)], 'huge.png'),
    ]);

    expect(result).toEqual({ added: 0, skipped: ['huge.png'] });
    expect(db.customIcon.find()).toEqual([]);
    expect(db.customIconData.find()).toEqual([]);
  });

  test('falls back to the default pack and keeps packs in creation order', async () => {
    const { service } = setup();
    const now = vi.spyOn(Date, 'now');

    now.mockReturnValue(1);
    await service.upload([image('z.png')]);
    now.mockReturnValue(2);
    await service.upload([image('a.png')], 'Another');
    now.mockReturnValue(3);
    await service.upload([image('b.png')]);

    expect(
      service.packs$.value.map(pack => [
        pack.name,
        pack.icons.map(icon => icon.name),
      ])
    ).toEqual([
      ['My icons', ['z', 'b']],
      ['Another', ['a']],
    ]);
  });

  test('deleting an icon or a pack deletes the image bytes too', async () => {
    const { service, db } = setup();
    await service.upload([image('a.png'), image('b.png')], 'Brand');
    await service.upload([image('c.png')], 'Other');
    const [a, b] = service.packs$.value[0].icons;
    const [c] = service.packs$.value[1].icons;

    service.deleteIcon(a.id);
    expect(service.packs$.value[0].icons).toEqual([b]);
    expect(db.customIconData.get(a.id)).toBeNull();
    expect(db.customIconData.get(b.id)).not.toBeNull();

    service.deletePack('Brand');
    expect(service.packs$.value.map(pack => pack.name)).toEqual(['Other']);
    expect(db.customIconData.find().map(data => data.id)).toEqual([c.id]);
  });

  test('deleted image bytes are dropped from the synced doc', async () => {
    const { service, docs } = setup();
    const size = () =>
      encodeStateAsUpdate(docs.get('customIconData') as YDoc).byteLength;

    await service.upload([image('a.png', 'x'.repeat(100 * 1024))], 'Brand');
    expect(size()).toBeGreaterThan(100 * 1024);

    service.deletePack('Brand');
    expect(size()).toBeLessThan(1024);
  });

  test('creates one object url per icon, revoked when the icon is deleted', async () => {
    const { service } = setup();
    const { create, revoke } = mockObjectUrls();
    await service.upload([image('a.png')], 'Brand');
    const [{ id }] = service.packs$.value[0].icons;

    expect(service.peekUrl(id)).toBeUndefined();
    const first = vi.fn();
    const second = vi.fn();
    const unwatchFirst = service.watchUrl(id, first);
    const unwatchSecond = service.watchUrl(id, second);
    expect(first).toHaveBeenLastCalledWith('blob:url-1');
    expect(second).toHaveBeenLastCalledWith('blob:url-1');
    expect(service.peekUrl(id)).toBe('blob:url-1');
    expect(create).toHaveBeenCalledTimes(1);
    expect((create.mock.calls[0][0] as Blob).type).toBe('image/png');
    expect(await (create.mock.calls[0][0] as Blob).text()).toBe('a.png');

    // docs still pointing at a deleted icon fall back to the placeholder
    service.deleteIcon(id);
    expect(first).toHaveBeenLastCalledWith(null);
    expect(second).toHaveBeenLastCalledWith(null);
    expect(revoke).toHaveBeenCalledWith('blob:url-1');
    expect(service.peekUrl(id)).toBeUndefined();

    unwatchFirst();
    unwatchSecond();
  });

  test('picks up an image that arrives later, e.g. by sync', async () => {
    const { service, db } = setup();
    mockObjectUrls();
    const callback = vi.fn();

    const unwatch = service.watchUrl('late', callback);
    expect(callback).toHaveBeenLastCalledWith(null);

    db.customIconData.create({ id: 'late', mime: 'image/png', data: 'AA==' });
    expect(callback).toHaveBeenLastCalledWith('blob:url-1');
    unwatch();
  });

  test('ignores synced data that does not claim to be a supported image', () => {
    const { service, db } = setup();
    const { create } = mockObjectUrls();
    db.customIconData.create({ id: 'evil', mime: 'text/html', data: 'AA==' });
    const callback = vi.fn();

    service.watchUrl('evil', callback)();

    expect(callback).toHaveBeenLastCalledWith(null);
    expect(create).not.toHaveBeenCalled();
  });

  test('revokes the object urls on dispose', async () => {
    const { service } = setup();
    const { revoke } = mockObjectUrls();
    await service.upload([image('a.png')], 'Brand');
    const [{ id }] = service.packs$.value[0].icons;
    service.watchUrl(id, () => {})();

    service.dispose();

    expect(revoke).toHaveBeenCalledWith('blob:url-1');
    expect(service.peekUrl(id)).toBeUndefined();
  });
});
