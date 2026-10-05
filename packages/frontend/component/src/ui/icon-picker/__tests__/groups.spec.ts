import keywords from '@blocksuite/icons/keywords/en.json';
import * as litIcons from '@blocksuite/icons/lit';
import * as rcIcons from '@blocksuite/icons/rc';
import { describe, expect, test } from 'vitest';

import {
  buildIconGroups,
  filterIconGroups,
  iconGroups,
} from '../picker/affine-icon/groups';

const data = {
  Brand: [
    { name: 'Github', keywords: ['github', 'code'] },
    { name: 'Missing', keywords: ['missing'] },
  ],
  filled: [{ name: 'Removed', keywords: ['removed'] }],
  'Emoji Panel': [{ name: 'BagPanel', keywords: ['bag-panel', 'shopping'] }],
};

describe('icon library groups', () => {
  test('groups by category, the original group first', () => {
    const groups = buildIconGroups(data, () => true);
    expect(groups.map(group => group.name)).toEqual([
      'General',
      'Brand',
      'Filled',
    ]);
  });

  test('excludes icons that can not be rendered and empty groups', () => {
    const groups = buildIconGroups(
      data,
      name => !['Missing', 'Removed'].includes(name)
    );
    expect(groups).toEqual([
      { name: 'General', icons: data['Emoji Panel'] },
      { name: 'Brand', icons: [data.Brand[0]] },
    ]);
  });

  test('filters by keyword across all groups', () => {
    const groups = buildIconGroups(data, () => true);
    expect(filterIconGroups(groups, '')).toBe(groups);
    expect(filterIconGroups(groups, ' SHOP ')).toEqual([
      { name: 'General', icons: data['Emoji Panel'] },
    ]);
    expect(filterIconGroups(groups, 'nothing')).toEqual([]);
  });

  test('offers the whole library, every icon is renderable in react and lit', () => {
    const offered = iconGroups.flatMap(group => group.icons);
    expect(offered).toHaveLength(Object.values(keywords).flat().length);
    expect(iconGroups.length).toBe(Object.keys(keywords).length);
    expect(new Set(offered.map(icon => icon.name)).size).toBe(offered.length);
    for (const { name } of offered) {
      expect(rcIcons).toHaveProperty(`${name}Icon`);
      expect(litIcons).toHaveProperty(`${name}Icon`);
    }
  });
});
