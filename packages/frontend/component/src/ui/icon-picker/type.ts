export enum IconType {
  Emoji = 'emoji',
  AffineIcon = 'affine-icon',
  Custom = 'custom',
}

export type IconData =
  | {
      type: IconType.Emoji;
      unicode: string;
    }
  | {
      type: IconType.AffineIcon;
      name: string;
      color: string;
    }
  | {
      type: IconType.Custom;
      /**
       * id of the custom icon, see `CustomIconSource`
       */
      iconId: string;
    };

export const CUSTOM_ICON_MAX_SIZE = 256 * 1024;

/**
 * extension -> mime
 */
export const CUSTOM_ICON_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

export type CustomIcon = {
  id: string;
  name: string;
};

export type CustomIconPack = {
  name: string;
  icons: CustomIcon[];
};

export type CustomIconUploadResult = {
  added: number;
  /**
   * names of the files that are not a supported image or exceed the size limit
   */
  skipped: string[];
};

/**
 * Where custom icons live. Implemented by the app, since this package has no
 * access to the workspace storage.
 */
export interface CustomIconSource {
  packs: CustomIconPack[];
  /**
   * @param files images, or zip archives of images
   * @param packName the pack to add the icons to, created if not exists
   */
  upload(files: File[], packName?: string): Promise<CustomIconUploadResult>;
  deleteIcon(id: string): void;
  deletePack(name: string): void;
  /**
   * The object url of the icon image if it is already loaded.
   */
  peekUrl(iconId: string): string | undefined;
  /**
   * Watches the object url of the icon image, it is `null` while the image is
   * not available, e.g. the icon is deleted.
   *
   * @returns unsubscribe
   */
  watchUrl(iconId: string, callback: (url: string | null) => void): () => void;
}
