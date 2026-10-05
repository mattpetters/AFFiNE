/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CustomIconProvider } from '../custom-icon';
import { IconRenderer } from '../renderer';
import { type CustomIconSource, type IconData, IconType } from '../type';

const icon: IconData = { type: IconType.Custom, iconId: 'icon-1' };

const createSource = (overrides: Partial<CustomIconSource>) =>
  ({
    packs: [],
    peekUrl: () => undefined,
    watchUrl: () => () => {},
    ...overrides,
  }) as CustomIconSource;

afterEach(cleanup);

describe('IconRenderer with a custom icon', () => {
  test('follows the image url, with a placeholder while there is none', () => {
    let emit: (url: string | null) => void = () => {};
    const unwatch = vi.fn();
    const watchUrl = vi.fn((_: string, callback: typeof emit) => {
      emit = callback;
      return unwatch;
    });
    const { container, unmount } = render(
      <CustomIconProvider value={createSource({ watchUrl })}>
        <IconRenderer data={icon} fallback="fallback" />
      </CustomIconProvider>
    );

    expect(watchUrl).toHaveBeenCalledWith('icon-1', expect.any(Function));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('span')).not.toBeNull();

    act(() => emit('blob:icon-1'));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'blob:icon-1'
    );
    // an svg is never inlined
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('');

    // the icon is deleted
    act(() => emit(null));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('span')).not.toBeNull();

    unmount();
    expect(unwatch).toHaveBeenCalledTimes(1);
  });

  test('renders an already loaded image immediately', () => {
    const { container } = render(
      <CustomIconProvider
        value={createSource({ peekUrl: () => 'blob:icon-1' })}
      >
        <IconRenderer data={icon} />
      </CustomIconProvider>
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'blob:icon-1'
    );
  });

  test('renders a placeholder without a custom icon source', () => {
    const { container } = render(<IconRenderer data={icon} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('span')).not.toBeNull();
  });
});
