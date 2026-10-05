/**
 * @vitest-environment happy-dom
 */
import { type IconData, IconType } from '@affine/component';
import { render } from 'lit';
import { describe, expect, test, vi } from 'vitest';

import { getDocIconComponentLit } from './icon';

const icon: IconData = { type: IconType.Custom, iconId: 'icon-1' };

const renderIcon = (url: string | null) => {
  const getCustomIconUrl = vi.fn(() => url);
  const container = document.createElement('div');
  render(getDocIconComponentLit(icon, getCustomIconUrl)(), container);
  expect(getCustomIconUrl).toHaveBeenCalledWith('icon-1');
  return container;
};

describe('getDocIconComponentLit with a custom icon', () => {
  test('renders the image through an img', () => {
    const container = renderIcon('blob:icon-1');

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'blob:icon-1'
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  test('renders a placeholder if the image is not available', () => {
    const container = renderIcon(null);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('span')).not.toBeNull();
  });

  test('does not ask for an image for other icons', () => {
    const getCustomIconUrl = vi.fn();
    getDocIconComponentLit(
      { type: IconType.Emoji, unicode: '💡' },
      getCustomIconUrl
    );

    expect(getCustomIconUrl).not.toHaveBeenCalled();
  });
});
