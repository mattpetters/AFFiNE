import { IconPickerServiceIdentifier } from '@blocksuite/affine/shared/services';
import { type ExtensionType } from '@blocksuite/affine/store';
import type { Container } from '@blocksuite/global/di';
import type { FrameworkProvider } from '@toeverything/infra';

import { CustomIconService } from '../../../modules/custom-icon';
import { IconPickerService } from '../../../modules/icon-picker/services/icon-picker';

/**
 * Patch the icon picker service to make it available in BlockSuite
 * @param framework
 * @returns
 */
export function patchIconPickerService(
  framework: FrameworkProvider
): ExtensionType {
  return {
    setup: (di: Container) => {
      di.override(IconPickerServiceIdentifier, () => {
        return {
          iconPickerComponent:
            framework.get(IconPickerService).iconPickerComponent,
          watchCustomIconUrl: (iconId, callback) => {
            // custom icons belong to a workspace
            const customIconService = framework.getOptional(CustomIconService);
            if (!customIconService) {
              callback(null);
              return () => {};
            }
            return customIconService.watchUrl(iconId, callback);
          },
        };
      });
    },
  };
}
