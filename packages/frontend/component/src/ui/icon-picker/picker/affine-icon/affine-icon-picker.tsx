import { SearchIcon } from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import {
  createContext,
  type KeyboardEvent,
  memo,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { IconButton } from '../../../button';
import Input from '../../../input';
import { Masonry, type MasonryGroup, type MasonryItem } from '../../../masonry';
import { Menu } from '../../../menu';
import { AffineIconRenderer } from '../../renderer/affine-icon';
import * as pickerStyles from '../picker.css';
import * as styles from './affine-icon-picker.css';
import { filterIconGroups, type IconGroup, iconGroups } from './groups';

const colorList: string[] = [
  cssVarV2.block.callout.icon.red,
  cssVarV2.block.callout.icon.orange,
  cssVarV2.block.callout.icon.yellow,
  cssVarV2.block.callout.icon.green,
  cssVarV2.block.callout.icon.teal,
  cssVarV2.block.callout.icon.blue,
  cssVarV2.block.callout.icon.purple,
  cssVarV2.block.callout.icon.magenta,
  cssVarV2.block.callout.icon.grey,
];

const useRecentIcons = () => {
  const [recentIcons, setRecentIcons] = useState<Array<string>>([]);

  useEffect(() => {
    const recentIcons = localStorage.getItem('recentIcons');
    setRecentIcons(recentIcons ? recentIcons.split(',') : []);
  }, []);

  const add = useCallback((icon: string) => {
    setRecentIcons(prevRecentIcons => {
      const newRecentIcons = [
        icon,
        ...prevRecentIcons.filter(e => e !== icon),
      ].slice(0, 10);
      localStorage.setItem('recentIcons', newRecentIcons.join(','));
      return newRecentIcons;
    });
  }, []);

  return {
    recentIcons,
    add,
  };
};

const IconGroupContext = createContext<{
  onSelect: (icon: string) => void;
  color?: string;
}>({
  onSelect: () => {},
});

const IconGroupItem = memo(function IconGroupItem({
  itemId,
}: {
  itemId: string;
}) {
  const { onSelect, color } = useContext(IconGroupContext);

  return (
    <IconButton
      size={24}
      style={{ padding: 4 }}
      aria-label={itemId}
      icon={<AffineIconRenderer style={{ color }} name={itemId} />}
      onClick={() => onSelect(itemId)}
    />
  );
});
const IconGroupHeader = memo(function IconGroupHeader({
  groupId,
}: {
  groupId: string;
}) {
  return (
    <div className={pickerStyles.groupName} data-group-name={groupId}>
      {groupId}
    </div>
  );
});

export const AffineIconPicker = ({
  onSelect,
}: {
  onSelect?: (icon: string, color: string) => void;
}) => {
  const [groups, setGroups] = useState<IconGroup[]>(iconGroups);
  const [keyword, setKeyword] = useState('');
  const [color, setColor] = useState<string>(cssVarV2.block.callout.icon.blue);

  const { recentIcons, add: addRecentIcon } = useRecentIcons();

  useEffect(() => {
    startTransition(() => {
      setGroups(filterIconGroups(iconGroups, keyword));
    });
  }, [keyword]);

  const handleIconSelect = useCallback(
    (icon: string) => {
      addRecentIcon(icon);
      onSelect?.(icon, color);
    },
    [addRecentIcon, onSelect, color]
  );

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
    },
    []
  );

  const items = useMemo(() => {
    const toGroup = (name: string, icons: string[]) =>
      ({
        id: name,
        height: 30,
        Component: IconGroupHeader,
        items: icons.map(
          icon =>
            ({
              id: icon,
              height: 32,
              ratio: 1,
              Component: IconGroupItem,
            }) satisfies MasonryItem
        ),
      }) satisfies MasonryGroup;

    const masonryGroups = groups.map(group =>
      toGroup(
        group.name,
        group.icons.map(icon => icon.name)
      )
    );
    if (recentIcons.length) {
      masonryGroups.unshift(toGroup('Recent', recentIcons));
    }
    return masonryGroups;
  }, [groups, recentIcons]);
  const contextValue = useMemo(
    () => ({ onSelect: handleIconSelect, color }),
    [handleIconSelect, color]
  );

  return (
    <div className={pickerStyles.root}>
      {/* Search */}
      <header className={pickerStyles.searchContainer}>
        <Input
          value={keyword}
          onChange={setKeyword}
          onKeyDown={handleSearchKeyDown}
          className={pickerStyles.searchInput}
          preFix={
            <div style={{ marginLeft: 10, lineHeight: 0 }}>
              <SearchIcon
                style={{ color: cssVarV2.icon.primary, fontSize: 16 }}
              />
            </div>
          }
          placeholder="Filter..."
        />

        {/* Color Picker */}
        <Menu
          contentOptions={{
            side: 'bottom',
            align: 'center',
            sideOffset: 4,
          }}
          items={
            <div className={styles.colorList}>
              {colorList.map(color => (
                <IconButton
                  key={color}
                  size={18}
                  style={{ padding: 2 }}
                  icon={
                    <div
                      className={styles.colorDot}
                      style={{ background: color }}
                    />
                  }
                  onClick={() => setColor(color)}
                />
              ))}
            </div>
          }
        >
          <IconButton
            size={18}
            style={{
              width: 32,
              height: 32,
              border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
            }}
            icon={
              <div className={styles.colorDot} style={{ background: color }} />
            }
          />
        </Menu>
      </header>

      {/* Groups */}
      <IconGroupContext.Provider value={contextValue}>
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
      </IconGroupContext.Provider>
    </div>
  );
};
