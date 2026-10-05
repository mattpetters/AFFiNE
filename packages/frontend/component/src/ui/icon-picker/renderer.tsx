import type { ReactNode } from 'react';

import { useCustomIconUrl } from './custom-icon';
import * as styles from './renderer.css';
import { AffineIconRenderer } from './renderer/affine-icon';
import { type IconData, IconType } from './type';

export const CustomIconRenderer = ({ iconId }: { iconId: string }) => {
  const url = useCustomIconUrl(iconId);

  if (!url) {
    return <span className={styles.customIconPlaceholder} />;
  }
  // always an <img>, so scripts in an uploaded svg can never run
  return (
    <img className={styles.customIcon} src={url} alt="" draggable={false} />
  );
};

export const IconRenderer = ({
  data,
  fallback,
  ...props
}: {
  data?: IconData;
  fallback?: ReactNode;
}) => {
  if (!data) {
    return fallback ?? null;
  }

  if (data.type === IconType.Emoji && data.unicode) {
    return data.unicode;
  }
  if (data.type === IconType.AffineIcon && data.name) {
    return (
      <AffineIconRenderer name={data.name} color={data.color} {...props} />
    );
  }
  if (data.type === IconType.Custom && data.iconId) {
    return <CustomIconRenderer iconId={data.iconId} />;
  }

  return fallback ?? null;
};
