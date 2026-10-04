/**
 * @vitest-environment happy-dom
 */

import { useLayoutEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  Outlet,
  type RouteObject,
  RouterProvider,
  useParams,
} from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createNavigableHistory } from '../../../../utils/navigable-history';
import type { View } from '../../entities/view';
import type { Workbench } from '../../entities/workbench';
import { useBindWorkbenchToBrowserRouter } from '../browser-adapter';
import { ViewRoot } from '../view-root';

vi.mock('@toeverything/infra', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    FrameworkScope: ({ children }: { children: React.ReactNode }) => children,
    useLiveData: (value: ReturnType<typeof liveValue>) =>
      useSyncExternalStore(value.reactSubscribe, value.reactGetSnapshot),
  };
});

function liveValue<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get value() {
      return value;
    },
    next(next: T) {
      value = next;
      listeners.forEach(listener => listener());
    },
    reactGetSnapshot: () => value,
    reactSubscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach(cleanup => cleanup());
});

function mountWorkbench() {
  window.history.replaceState(null, '', '/workspace/test/start');
  const history = createNavigableHistory({ initialEntries: ['/all'] });
  const location = liveValue(history.location);
  const actions: { action: string; pathname: string; state: unknown }[] = [];
  cleanups.push(
    history.listen(update => {
      actions.push({
        action: update.action,
        pathname: update.location.pathname,
        state: update.location.state,
      });
      location.next(update.location);
    })
  );
  const view = {
    id: 'view',
    scope: {},
    history,
    location$: location,
  } as unknown as View;
  const workbench = {
    activeView$: liveValue(view),
  } as unknown as Workbench;

  const JournalRedirect = () => {
    const current = useSyncExternalStore(
      location.reactSubscribe,
      location.reactGetSnapshot
    );
    useLayoutEffect(() => {
      if (current.pathname === '/journals') {
        history.replace('/today-journal');
      }
    }, [current.pathname]);
    return null;
  };
  const Doc = () => <main data-doc-id={useParams().pageId} />;
  const routes: RouteObject[] = [
    {
      element: <Outlet />,
      children: [
        { path: '/:pageId', Component: Doc },
        // A cached route resolves in a microtask. Delaying this with a timer
        // hides the stale browser-echo race after the layout-effect redirect.
        {
          path: '/journals',
          lazy: async () => ({ Component: JournalRedirect }),
        },
        { path: '*', Component: () => null },
      ],
    },
  ];
  const App = () => {
    useBindWorkbenchToBrowserRouter(workbench, '/workspace/test');
    return (
      <>
        <a
          href="/workspace/test/journals"
          onClick={event => {
            history.push('/journals');
            event.preventDefault();
          }}
        >
          Journals
        </a>
        <ViewRoot view={view} routes={routes} />
      </>
    );
  };
  const browserRouter = createBrowserRouter([
    { path: '/workspace/test/*', Component: App },
  ]);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  root.render(<RouterProvider router={browserRouter} />);
  cleanups.push(() => {
    root.unmount();
    browserRouter.dispose();
    container.remove();
  });
  return { history, browserRouter, container, actions };
}

describe('browser workbench navigation', () => {
  test('keeps an immediate journal redirect and still handles browser Back/Forward', async () => {
    const { history, browserRouter, container, actions } = mountWorkbench();
    await vi.waitFor(() => {
      expect(container.querySelector('main')?.dataset.docId).toBe('start');
    });

    container.querySelector('a')!.click();
    await vi.waitFor(() => {
      expect(container.querySelector('main')?.dataset.docId).toBe(
        'today-journal'
      );
      expect(history.location.pathname).toBe('/today-journal');
      expect(browserRouter.state.location.pathname).toBe(
        '/workspace/test/today-journal'
      );
    });
    expect(actions).not.toContainEqual({
      action: 'PUSH',
      pathname: '/journals',
      state: 'fromBrowser',
    });

    await browserRouter.navigate(-1);
    await vi.waitFor(() => {
      expect(history.location.pathname).toBe('/start');
      expect(container.querySelector('main')?.dataset.docId).toBe('start');
    });
    await browserRouter.navigate(1);
    await vi.waitFor(() => {
      expect(history.location.pathname).toBe('/today-journal');
      expect(container.querySelector('main')?.dataset.docId).toBe(
        'today-journal'
      );
    });
  });

  test('accepts browser navigation that did not originate in the workbench', async () => {
    const { history, browserRouter, container } = mountWorkbench();
    await vi.waitFor(() => {
      expect(container.querySelector('main')?.dataset.docId).toBe('start');
    });
    await browserRouter.navigate('/workspace/test/other');
    await vi.waitFor(() => {
      expect(history.location.pathname).toBe('/other');
      expect(container.querySelector('main')?.dataset.docId).toBe('other');
    });
  });
});
