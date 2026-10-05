import keywords from '@blocksuite/icons/keywords/en.json';
import * as allIcons from '@blocksuite/icons/rc';

export type Icon = {
  name: string;
  keywords: string[];
};

export type IconGroup = {
  name: string;
  icons: Icon[];
};

// the group that was offered before the whole library, keep it on top
const PRIMARY_GROUP = 'Emoji Panel';
const GROUP_TITLES: Record<string, string> = {
  [PRIMARY_GROUP]: 'General',
  filled: 'Filled',
};

/**
 * @param resolvable whether the icon name can be rendered, see `AffineIconRenderer`
 */
export const buildIconGroups = (
  data: Record<string, Icon[]>,
  resolvable: (name: string) => boolean
): IconGroup[] => {
  return Object.keys(data)
    .sort((a, b) => Number(b === PRIMARY_GROUP) - Number(a === PRIMARY_GROUP))
    .map(name => ({
      name: GROUP_TITLES[name] ?? name,
      icons: data[name].filter(icon => resolvable(icon.name)),
    }))
    .filter(group => group.icons.length > 0);
};

export const filterIconGroups = (groups: IconGroup[], keyword: string) => {
  const lowerKeyword = keyword.trim().toLowerCase();
  if (!lowerKeyword) return groups;

  return groups
    .map(group => ({
      ...group,
      icons: group.icons.filter(icon =>
        icon.keywords.some(kw => kw.includes(lowerKeyword))
      ),
    }))
    .filter(group => group.icons.length > 0);
};

export const iconGroups = buildIconGroups(
  keywords,
  name => `${name}Icon` in allIcons
);
