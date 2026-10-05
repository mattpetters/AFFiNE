import ava from 'ava';

import { byokRouteChoices } from '../../plugins/copilot/resolver';
import {
  byokRouteTargetId,
  ChatQuerySchema,
} from '../../plugins/copilot/types';

const test = ava;

test('target override is all-or-nothing and preserves opaque model ids', t => {
  const parsed = ChatQuerySchema.parse({
    profileId: 'profile-1',
    modelId: 'vendor/model:B',
  });
  t.is(parsed.profileId, 'profile-1');
  t.is(parsed.modelId, 'vendor/model:B');
  t.throws(() => ChatQuerySchema.parse({ profileId: 'profile-1' }));
  t.throws(() => ChatQuerySchema.parse({ modelId: 'vendor/model:B' }));
  t.is(
    ChatQuerySchema.parse({ routeTargetId: 'terra' }).routeTargetId,
    'terra'
  );
});

test('caller supplied route policy facts are rejected', t => {
  for (const field of ['requirements', 'deployment', 'profiles', 'presets']) {
    t.throws(() => ChatQuerySchema.parse({ [field]: 'caller-value' }));
  }
});

test('byok route target ids resolve to an explicit profile and model', t => {
  const id = byokRouteTargetId('profile-1', 'vendor/model:B');
  const parsed = ChatQuerySchema.parse({ routeTargetId: id });
  t.is(parsed.profileId, 'profile-1');
  t.is(parsed.modelId, 'vendor/model:B');
  t.is(parsed.routeTargetId, undefined);

  for (const malformed of ['byok:', 'byok:profile-1', 'byok:profile-1:']) {
    const kept = ChatQuerySchema.parse({ routeTargetId: malformed });
    t.is(kept.routeTargetId, malformed);
    t.is(kept.profileId, undefined);
  }

  // an explicit profile/model pair is never overridden by the route target
  const explicit = ChatQuerySchema.parse({
    profileId: 'profile-2',
    modelId: 'model-2',
    routeTargetId: id,
  });
  t.is(explicit.profileId, 'profile-2');
  t.is(explicit.routeTargetId, id);
});

test('byok route choices list enabled text models of enabled profiles', t => {
  const capability = (output: string[]) => ({
    input: ['text'],
    output,
    features: [],
    attachmentKinds: [],
    attachmentSources: [],
  });
  const profile = (
    profileId: string,
    enabled: boolean,
    models: { modelId: string; enabled: boolean; output: string[] }[]
  ) => ({
    profileId,
    workspaceId: 'workspace-1',
    provider: 'openai',
    name: 'Team Key',
    enabled,
    sortOrder: 0,
    revision: 1,
    definition: {
      endpoint: {} as never,
      models: models.map(({ output, ...model }) => ({
        ...model,
        capabilities: [capability(output)],
      })),
    },
  });

  const choices = byokRouteChoices([
    profile('profile-1', true, [
      { modelId: 'gpt-chat', enabled: true, output: ['text', 'object'] },
      { modelId: 'gpt-off', enabled: false, output: ['text'] },
      { modelId: 'embedder', enabled: true, output: ['embedding'] },
    ]),
    profile('profile-2', false, [
      { modelId: 'gpt-chat', enabled: true, output: ['text'] },
    ]),
  ]);

  t.deepEqual(choices, [
    {
      id: 'byok:profile-1:gpt-chat',
      displayName: 'gpt-chat Team Key',
      minimumTier: 'Standard',
      available: true,
    },
  ]);
  t.deepEqual(ChatQuerySchema.parse({ routeTargetId: choices[0].id }), {
    ...ChatQuerySchema.parse({}),
    profileId: 'profile-1',
    modelId: 'gpt-chat',
  });
});
