import { Framework } from '@toeverything/infra';
import { EMPTY } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import { AIModelService } from './models';

describe('AIModelService', () => {
  test('clears the previous model while a new scope is loading', async () => {
    let resolveSecond: ((value: unknown) => void) | undefined;
    const gql = vi
      .fn()
      .mockResolvedValueOnce({
        currentUser: {
          copilot: {
            routeOptions: {
              choices: [
                {
                  id: 'model-a',
                  displayName: 'Model A',
                  available: true,
                },
              ],
            },
          },
        },
      })
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSecond = resolve;
          })
      );
    const stored = new Map<string, unknown>();
    const framework = new Framework();
    framework.service(
      AIModelService,
      () =>
        new AIModelService(
          {
            globalState: {
              get: (key: string) => stored.get(key),
              set: (key: string, value: unknown) => stored.set(key, value),
            },
          } as never,
          { gql } as never,
          {
            subscription: { ai$: EMPTY },
          } as never
        )
    );
    const service = framework.provider().get(AIModelService);

    service.setScope('workspace-a', 'route-a');
    await vi.waitFor(() => expect(service.models.value).toHaveLength(1));
    service.setModel('model-a');

    service.setScope('workspace-b', 'route-b');
    expect(service.models.value).toEqual([]);
    expect(service.modelId.value).toBeUndefined();
    service.setModel('model-a');
    expect(stored.has('AIManagedRouteTarget:workspace-b:route-b')).toBe(false);

    resolveSecond?.({
      currentUser: { copilot: { routeOptions: { choices: [] } } },
    });
  });

  test('loads route options for the workspace and selects a workspace model', async () => {
    const gql = vi.fn().mockResolvedValue({
      currentUser: {
        copilot: {
          routeOptions: {
            choices: [
              {
                id: 'byok:profile-1:gpt-chat',
                displayName: 'gpt-chat Team Key',
                available: true,
              },
            ],
          },
        },
      },
    });
    const stored = new Map<string, unknown>();
    const framework = new Framework();
    framework.service(
      AIModelService,
      () =>
        new AIModelService(
          {
            globalState: {
              get: (key: string) => stored.get(key),
              set: (key: string, value: unknown) => stored.set(key, value),
            },
          } as never,
          { gql } as never,
          {
            subscription: { ai$: EMPTY },
          } as never
        )
    );
    const service = framework.provider().get(AIModelService);

    service.setScope('workspace-a', 'route-a');
    await vi.waitFor(() => expect(service.models.value).toHaveLength(1));

    expect(gql.mock.calls[0][0].variables).toEqual({
      workspaceId: 'workspace-a',
      promptName: 'route-a',
    });
    expect(service.models.value[0]).toMatchObject({
      category: 'gpt-chat',
      version: 'Team Key',
    });
    service.setModel('byok:profile-1:gpt-chat');
    expect(service.modelId.value).toBe('byok:profile-1:gpt-chat');
  });
});
