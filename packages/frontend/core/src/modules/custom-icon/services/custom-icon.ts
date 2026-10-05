import {
  CUSTOM_ICON_MIME,
  type CustomIconPack,
  type CustomIconUploadResult,
} from '@affine/component';
import { LiveData, Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import {
  base64ToUint8Array,
  uint8ArrayToBase64,
} from '../../workspace-engine/utils/base64';
import type { CustomIconStore } from '../store/custom-icon';
import { collectIconFiles } from '../utils/collect-icon-files';

export const DEFAULT_CUSTOM_ICON_PACK = 'My icons';

type ObservedValue<T> = T extends Observable<infer V> ? V : never;
type CustomIconRecord = ObservedValue<
  ReturnType<CustomIconStore['watchIcons']>
>[number];
type CustomIconData = ObservedValue<
  ReturnType<CustomIconStore['watchIconData']>
>;

const ALLOWED_MIME = new Set(Object.values(CUSTOM_ICON_MIME));

/**
 * Packs are ordered by their oldest icon, icons by upload time then name.
 */
export const groupIconsIntoPacks = (
  icons: CustomIconRecord[]
): CustomIconPack[] => {
  const packs = new Map<string, CustomIconPack>();
  [...icons]
    .sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
    .forEach(({ id, name, pack: packName }) => {
      let pack = packs.get(packName);
      if (!pack) {
        pack = { name: packName, icons: [] };
        packs.set(packName, pack);
      }
      pack.icons.push({ id, name });
    });
  return [...packs.values()];
};

export class CustomIconService extends Service {
  constructor(private readonly store: CustomIconStore) {
    super();
    this.disposables.push(() => {
      this.disposed = true;
      this.urls.forEach(url => URL.revokeObjectURL(url));
      this.urls.clear();
    });
  }

  private disposed = false;

  // ponytail: the url of an icon lives until the icon is deleted or the
  // workspace is closed, release them by usage if the amount of rendered
  // custom icons ever becomes a memory issue
  private readonly urls = new Map<string, string>();

  readonly packs$ = LiveData.from(
    this.store.watchIcons().pipe(map(groupIconsIntoPacks)),
    []
  );

  /**
   * @param packName falls back to the name of the archive the icon comes from
   */
  async upload(
    files: File[],
    packName?: string
  ): Promise<CustomIconUploadResult> {
    const { icons, skipped } = await collectIconFiles(files);
    const createdAt = Date.now();

    for (const icon of icons) {
      this.store.addIcon({
        pack: packName ?? icon.pack ?? DEFAULT_CUSTOM_ICON_PACK,
        name: icon.name,
        createdAt,
        mime: icon.blob.type,
        data: await uint8ArrayToBase64(
          new Uint8Array(await icon.blob.arrayBuffer())
        ),
      });
    }

    return { added: icons.length, skipped };
  }

  deleteIcon(id: string) {
    this.store.deleteIcon(id);
  }

  deletePack(pack: string) {
    this.store.deletePack(pack);
  }

  peekUrl(iconId: string) {
    return this.urls.get(iconId);
  }

  /**
   * The object url of the icon image, `null` while the image is not available,
   * e.g. it is not synced yet or the icon is deleted.
   */
  url$(iconId: string) {
    return LiveData.from(
      this.store
        .watchIconData(iconId)
        .pipe(map(data => this.resolveUrl(iconId, data))),
      this.urls.get(iconId) ?? null
    );
  }

  /**
   * @returns unsubscribe
   */
  watchUrl(iconId: string, callback: (url: string | null) => void) {
    const subscription = this.url$(iconId).subscribe(callback);
    return () => subscription.unsubscribe();
  }

  private resolveUrl(iconId: string, data: CustomIconData) {
    const cached = this.urls.get(iconId);
    // the table is synced, so its content can not be trusted to be an image
    if (!data || !ALLOWED_MIME.has(data.mime) || this.disposed) {
      if (cached) {
        URL.revokeObjectURL(cached);
        this.urls.delete(iconId);
      }
      return null;
    }
    if (cached) return cached;

    const url = URL.createObjectURL(
      new Blob([base64ToUint8Array(data.data)], { type: data.mime })
    );
    this.urls.set(iconId, url);
    return url;
  }
}
