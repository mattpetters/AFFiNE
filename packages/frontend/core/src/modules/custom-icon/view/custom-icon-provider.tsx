import { CustomIconProvider, type CustomIconSource } from '@affine/component';
import { useLiveData, useService } from '@toeverything/infra';
import { type PropsWithChildren, useMemo } from 'react';

import { CustomIconService } from '../services/custom-icon';

/**
 * Makes the custom icons of the current workspace available to the icon picker
 * and the icon renderer.
 */
export const WorkspaceCustomIconProvider = ({
  children,
}: PropsWithChildren) => {
  const customIconService = useService(CustomIconService);
  const packs = useLiveData(customIconService.packs$);

  const source = useMemo<CustomIconSource>(
    () => ({
      packs,
      upload: (files, packName) => customIconService.upload(files, packName),
      deleteIcon: id => customIconService.deleteIcon(id),
      deletePack: name => customIconService.deletePack(name),
      peekUrl: iconId => customIconService.peekUrl(iconId),
      watchUrl: (iconId, callback) =>
        customIconService.watchUrl(iconId, callback),
    }),
    [customIconService, packs]
  );

  return <CustomIconProvider value={source}>{children}</CustomIconProvider>;
};
