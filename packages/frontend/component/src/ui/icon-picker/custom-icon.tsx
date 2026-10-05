import { createContext, useContext, useEffect, useState } from 'react';

import type { CustomIconSource } from './type';

const CustomIconContext = createContext<CustomIconSource | null>(null);

export const CustomIconProvider = CustomIconContext.Provider;

export const useCustomIconSource = () => useContext(CustomIconContext);

/**
 * @returns `undefined` while the image is not available
 */
export const useCustomIconUrl = (iconId: string) => {
  const source = useCustomIconSource();
  const [url, setUrl] = useState(() => source?.peekUrl(iconId));

  useEffect(() => {
    if (!source) {
      setUrl(undefined);
      return;
    }
    return source.watchUrl(iconId, url => setUrl(url ?? undefined));
  }, [iconId, source]);

  return url;
};
