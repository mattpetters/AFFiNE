/**
 * @vitest-environment happy-dom
 */
import {
  CUSTOM_ICON_MAX_SIZE,
  type IconData,
  IconType,
} from '@affine/component';
import { createORMClient, Framework, YjsDBAdapter } from '@toeverything/infra';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { WorkspaceDBService } from '../../db';
import { AFFiNE_WORKSPACE_DB_SCHEMA } from '../../db/schema';
import {
  ExplorerIconStore,
  type ExplorerType,
} from '../../explorer-icon/store/explorer-icon';
import { CustomIconStore } from '../store/custom-icon';
import { CustomIconService } from './custom-icon';

const emoji: IconData = { type: IconType.Emoji, unicode: '💡' };

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
    .store(ExplorerIconStore, [WorkspaceDBService])
    .store(CustomIconStore, [WorkspaceDBService])
    .service(CustomIconService, [CustomIconStore]);
  const provider = framework.provider();

  return {
    service: provider.get(CustomIconService),
    explorerIconStore: provider.get(ExplorerIconStore),
    db,
    doc: docs.get('explorerIcon') as YDoc,
  };
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
  test('stores uploaded icons in the explorerIcon table, under their own namespace', async () => {
    const { service, db } = setup();
    vi.spyOn(Date, 'now').mockReturnValue(42);

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
    expect(db.explorerIcon.find()).toHaveLength(2);
    expect(db.explorerIcon.get(`customIcon:${b.id}`)).toEqual({
      id: `customIcon:${b.id}`,
      icon: {
        pack: 'Brand',
        name: 'b',
        mime: 'image/png',
        data: btoa('bytes of b'),
        createdAt: 42,
      },
    });
  });

  test('never stores an image over the size limit', async () => {
    const { service, db } = setup();

    const result = await service.upload([
      new File([new Uint8Array(CUSTOM_ICON_MAX_SIZE + 1)], 'huge.png'),
    ]);

    expect(result).toEqual({ added: 0, skipped: ['huge.png'] });
    expect(db.explorerIcon.find()).toEqual([]);
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

  test('deleting an icon or a pack deletes its row, entity icons are kept', async () => {
    const { service, explorerIconStore, db } = setup();
    explorerIconStore.setIcon({ where: 'doc', id: 'doc-1', icon: emoji });
    await service.upload([image('a.png'), image('b.png')], 'Brand');
    await service.upload([image('c.png')], 'Other');
    const [a, b] = service.packs$.value[0].icons;
    const [c] = service.packs$.value[1].icons;

    service.deleteIcon(a.id);
    expect(service.packs$.value[0].icons).toEqual([b]);
    expect(db.explorerIcon.get(`customIcon:${a.id}`)).toBeNull();
    expect(db.explorerIcon.get(`customIcon:${b.id}`)).not.toBeNull();

    service.deletePack('Brand');
    expect(service.packs$.value.map(pack => pack.name)).toEqual(['Other']);
    expect(
      db.explorerIcon
        .find()
        .map(row => row.id)
        .sort()
    ).toEqual([`customIcon:${c.id}`, 'doc:doc-1'].sort());
  });

  test('deleted image bytes are dropped from the synced doc', async () => {
    const { service, doc } = setup();
    const size = () => encodeStateAsUpdate(doc).byteLength;

    await service.upload([image('a.png', 'x'.repeat(100 * 1024))], 'Brand');
    expect(size()).toBeGreaterThan(100 * 1024);

    service.deletePack('Brand');
    expect(size()).toBeLessThan(1024);
  });

  test('entity icons and custom icons never see each other', async () => {
    const { service, explorerIconStore, db } = setup();
    explorerIconStore.setIcon({ where: 'doc', id: 'doc-1', icon: emoji });
    explorerIconStore.setIcon({ where: 'tag', id: 'tag-1', icon: emoji });
    await service.upload([image('a.png')], 'Brand');
    const [{ id }] = service.packs$.value[0].icons;

    // only the custom icon is listed, though the table holds three rows
    expect(db.explorerIcon.find()).toHaveLength(3);
    expect(service.packs$.value).toEqual([
      { name: 'Brand', icons: [{ id, name: 'a' }] },
    ]);
    expect(explorerIconStore.getIcon('doc', 'doc-1')?.icon).toEqual(emoji);

    // a custom icon row is not the icon of an entity, whatever asks for it
    const customIcon = 'customIcon' as ExplorerType;
    expect(explorerIconStore.getIcon(customIcon, id)).toBeNull();
    const watched = vi.fn();
    explorerIconStore
      .watchIcon(customIcon, id)
      .subscribe(watched)
      .unsubscribe();
    expect(watched).toHaveBeenLastCalledWith(null);

    // an entity icon row is not a custom icon
    const url = vi.fn();
    service.watchUrl('doc-1', url)();
    expect(url).toHaveBeenLastCalledWith(null);
  });

  test('the pack list is not recomputed when an entity icon changes', async () => {
    const { service, explorerIconStore } = setup();
    await service.upload([image('a.png')], 'Brand');
    const packs = vi.fn();
    const subscription = service.packs$.subscribe(packs);
    packs.mockClear();

    explorerIconStore.setIcon({ where: 'doc', id: 'doc-1', icon: emoji });
    explorerIconStore.setIcon({ where: 'doc', id: 'doc-1' });
    expect(packs).not.toHaveBeenCalled();

    await service.upload([image('b.png')], 'Brand');
    expect(packs).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  test('ignores malformed rows in the custom icon namespace', () => {
    const { service, db } = setup();
    db.explorerIcon.create({ id: 'customIcon:emoji', icon: emoji });
    db.explorerIcon.create({
      id: 'customIcon:partial',
      icon: { pack: 'Brand', name: 'x' } as never,
    });

    expect(service.packs$.value).toEqual([]);
    const url = vi.fn();
    service.watchUrl('partial', url)();
    expect(url).toHaveBeenLastCalledWith(null);
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

  test('an icon synced from another device replaces the placeholder live', async () => {
    const local = setup();
    const remote = setup();
    mockObjectUrls();
    await remote.service.upload([image('a.png')], 'Brand');
    const [{ id }] = remote.service.packs$.value[0].icons;

    // subscribed first, as a rendered doc pointing at a not yet synced icon
    const callback = vi.fn();
    const unwatch = local.service.watchUrl(id, callback);
    expect(callback).toHaveBeenLastCalledWith(null);
    expect(local.service.packs$.value).toEqual([]);

    // the row arrives afterwards
    applyUpdate(local.doc, encodeStateAsUpdate(remote.doc), 'remote');

    expect(callback).toHaveBeenLastCalledWith('blob:url-1');
    expect(local.service.packs$.value).toEqual([
      { name: 'Brand', icons: [{ id, name: 'a' }] },
    ]);
    unwatch();
  });

  test('ignores synced data that does not claim to be a supported image', () => {
    const { service, db } = setup();
    const { create } = mockObjectUrls();
    db.explorerIcon.create({
      id: 'customIcon:evil',
      icon: {
        pack: 'Brand',
        name: 'evil',
        mime: 'text/html',
        data: 'AA==',
        createdAt: 1,
      },
    });
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
