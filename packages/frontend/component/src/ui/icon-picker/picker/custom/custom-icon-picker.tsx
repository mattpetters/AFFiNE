import { useI18n } from '@affine/i18n';
import { CloseIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import {
  type ChangeEvent,
  createContext,
  type KeyboardEvent,
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Button, IconButton } from '../../../button';
import Input from '../../../input';
import { Masonry, type MasonryGroup, type MasonryItem } from '../../../masonry';
import { CustomIconRenderer } from '../../renderer';
import {
  CUSTOM_ICON_MAX_SIZE,
  CUSTOM_ICON_MIME,
  type CustomIcon,
  type CustomIconSource,
} from '../../type';
import * as pickerStyles from '../picker.css';
import * as styles from './custom-icon-picker.css';

const ACCEPT = [...Object.keys(CUSTOM_ICON_MIME), 'zip']
  .map(ext => `.${ext}`)
  .join(',');

const CustomIconContext = createContext<{
  icons: Map<string, CustomIcon>;
  onSelect: (iconId: string) => void;
  onDeleteIcon: (id: string) => void;
  onDeletePack: (name: string) => void;
}>({
  icons: new Map(),
  onSelect: () => {},
  onDeleteIcon: () => {},
  onDeletePack: () => {},
});

const CustomIconItem = memo(function CustomIconItem({
  itemId,
}: {
  itemId: string;
}) {
  const t = useI18n();
  const { icons, onSelect, onDeleteIcon } = useContext(CustomIconContext);
  const icon = icons.get(itemId);

  if (!icon) return null;

  return (
    <div className={styles.item}>
      <IconButton
        size={24}
        style={{ padding: 4 }}
        title={icon.name}
        aria-label={icon.name}
        icon={<CustomIconRenderer iconId={icon.id} />}
        onClick={() => onSelect(icon.id)}
      />
      <button
        className={styles.deleteIcon}
        title={t['com.affine.icon-picker.custom.delete-icon']()}
        aria-label={t['com.affine.icon-picker.custom.delete-icon']()}
        onClick={() => onDeleteIcon(icon.id)}
      >
        <CloseIcon />
      </button>
    </div>
  );
});

const CustomIconPackHeader = memo(function CustomIconPackHeader({
  groupId,
  itemCount,
}: {
  groupId: string;
  itemCount: number;
}) {
  const t = useI18n();
  const { onDeletePack } = useContext(CustomIconContext);
  // deleting a pack needs a second click to confirm
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={clsx(pickerStyles.groupName, styles.packHeader)}
      data-group-name={groupId}
      onMouseLeave={() => setConfirming(false)}
    >
      <span className={styles.packName}>{groupId}</span>
      <Button
        variant={confirming ? 'error' : 'plain'}
        size="custom"
        style={{ height: 22, padding: '0 6px', fontSize: 12, flexShrink: 0 }}
        onClick={() =>
          confirming ? onDeletePack(groupId) : setConfirming(true)
        }
      >
        {confirming
          ? t['com.affine.icon-picker.custom.delete-pack.confirm']({
              count: `${itemCount}`,
            })
          : t['com.affine.icon-picker.custom.delete-pack']()}
      </Button>
    </div>
  );
});

export const CustomIconPicker = ({
  source,
  onSelect,
}: {
  source: CustomIconSource;
  onSelect?: (iconId: string) => void;
}) => {
  const t = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [packName, setPackName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string>();

  const handleFilesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      // so that selecting the same files again still triggers a change
      e.target.value = '';
      if (!files.length) return;

      setUploading(true);
      source
        .upload(files, packName.trim() || undefined)
        .then(({ added, skipped }) => {
          const messages = [
            t['com.affine.icon-picker.custom.added']({ count: `${added}` }),
          ];
          if (skipped.length) {
            messages.push(
              t['com.affine.icon-picker.custom.skipped']({
                count: `${skipped.length}`,
              })
            );
          }
          setMessage(messages.join(' '));
          setPackName('');
        })
        .catch(err => {
          console.error(err);
          setMessage(t['com.affine.icon-picker.custom.failed']());
        })
        .finally(() => setUploading(false));
    },
    [packName, source, t]
  );

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
    },
    []
  );

  const items = useMemo(() => {
    return source.packs.map(
      pack =>
        ({
          id: pack.name,
          height: 30,
          Component: CustomIconPackHeader,
          items: pack.icons.map(
            icon =>
              ({
                id: icon.id,
                height: 32,
                ratio: 1,
                Component: CustomIconItem,
              }) satisfies MasonryItem
          ),
        }) satisfies MasonryGroup
    );
  }, [source.packs]);
  const contextValue = useMemo(
    () => ({
      icons: new Map(
        source.packs.flatMap(pack => pack.icons.map(icon => [icon.id, icon]))
      ),
      onSelect: (iconId: string) => onSelect?.(iconId),
      onDeleteIcon: (id: string) => source.deleteIcon(id),
      onDeletePack: (name: string) => source.deletePack(name),
    }),
    [onSelect, source]
  );

  return (
    <div className={pickerStyles.root}>
      {/* Upload */}
      <header className={pickerStyles.searchContainer}>
        <Input
          value={packName}
          onChange={setPackName}
          onKeyDown={handleInputKeyDown}
          className={pickerStyles.searchInput}
          inputStyle={{ paddingLeft: 10 }}
          maxLength={50}
          placeholder={t['com.affine.icon-picker.custom.pack-name']()}
          data-testid="custom-icon-pack-name"
        />
        <Button
          variant="primary"
          style={{ height: 32 }}
          loading={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {t['com.affine.icon-picker.custom.upload']()}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          accept={ACCEPT}
          onChange={handleFilesChange}
          data-testid="custom-icon-file-input"
        />
      </header>
      <div className={styles.hint} role="status">
        {message ??
          t['com.affine.icon-picker.custom.hint']({
            size: `${CUSTOM_ICON_MAX_SIZE / 1024} KB`,
          })}
      </div>

      {/* Packs */}
      {items.length ? (
        <CustomIconContext.Provider value={contextValue}>
          <div className={pickerStyles.emojiScrollRoot}>
            <Masonry
              virtualScroll
              items={items}
              itemWidthMin={32}
              itemWidth={32}
              paddingX={12}
              paddingY={8}
              gapX={4}
              gapY={4}
            />
          </div>
        </CustomIconContext.Provider>
      ) : (
        <div className={styles.empty}>
          {t['com.affine.icon-picker.custom.empty']()}
        </div>
      )}
    </div>
  );
};
