import { useI18n } from '@affine/i18n';
import { cssVarV2 } from '@toeverything/theme/v2';
import clsx from 'clsx';
import { type HTMLAttributes, useMemo, useState } from 'react';

import { Button } from '../button';
import { RadioGroup, type RadioItem } from '../radio';
import { useCustomIconSource } from './custom-icon';
import * as styles from './icon-picker.css';
import { AffineIconPicker } from './picker/affine-icon/affine-icon-picker';
import { CustomIconPicker } from './picker/custom/custom-icon-picker';
import { EmojiPicker } from './picker/emoji/emoji-picker';
import { type IconData, IconType } from './type';

const builtinPanels: Array<RadioItem> = [
  { value: 'Emoji', className: styles.headerNavItem },
  { value: 'Icons', className: styles.headerNavItem },
];

export const IconPicker = ({
  className,
  style,
  onSelect,
}: Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  onSelect?: (data?: IconData) => void;
}) => {
  const t = useI18n();
  const [activePanel, setActivePanel] = useState<string>('Emoji');
  // only available when the app provides somewhere to store custom icons
  const customIconSource = useCustomIconSource();
  const panels = useMemo(
    () =>
      customIconSource
        ? [
            ...builtinPanels,
            {
              value: 'Custom',
              label: t['com.affine.icon-picker.custom'](),
              className: styles.headerNavItem,
            },
          ]
        : builtinPanels,
    [customIconSource, t]
  );

  return (
    <div className={clsx(styles.container, className)} style={{ ...style }}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          {/* Nav */}
          <RadioGroup
            items={panels}
            value={activePanel}
            onChange={setActivePanel}
            gap={12}
            padding={0}
            borderRadius={4}
            className={styles.headerNav}
            indicatorStyle={{
              backgroundColor: cssVarV2.button.primary,
              height: 2,
              bottom: -6,
              top: 'unset',
            }}
          />

          {/* Remove */}
          <Button
            variant="plain"
            style={{ color: cssVarV2.text.secondary, fontWeight: 500 }}
            onClick={() => onSelect?.()}
          >
            Remove
          </Button>
        </div>
      </header>
      <main className={styles.main}>
        {activePanel === 'Emoji' ? (
          <EmojiPicker
            onSelect={emoji => {
              onSelect?.({ type: IconType.Emoji, unicode: emoji });
            }}
          />
        ) : activePanel === 'Icons' ? (
          <AffineIconPicker
            onSelect={(icon, color) => {
              onSelect?.({ type: IconType.AffineIcon, name: icon, color });
            }}
          />
        ) : activePanel === 'Custom' && customIconSource ? (
          <CustomIconPicker
            source={customIconSource}
            onSelect={iconId => {
              onSelect?.({ type: IconType.Custom, iconId });
            }}
          />
        ) : null}
      </main>
    </div>
  );
};
