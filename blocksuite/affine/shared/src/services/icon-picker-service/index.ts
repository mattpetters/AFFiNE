import type { UniComponent } from '@blocksuite/affine-shared/types';
import { createIdentifier } from '@blocksuite/global/di';
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
       * id of the custom icon, see `IconPickerService.watchCustomIconUrl`
       */
      iconId: string;
    };

export interface IconPickerService {
  iconPickerComponent: UniComponent<{ onSelect?: (data?: IconData) => void }>;
  /**
   * Watches the image url of a custom icon, it is `null` while the image is
   * not available, e.g. the icon is deleted.
   *
   * @returns unsubscribe
   */
  watchCustomIconUrl(
    iconId: string,
    callback: (url: string | null) => void
  ): () => void;
}

export const IconPickerServiceIdentifier =
  createIdentifier<IconPickerService>('IconPickerService');
