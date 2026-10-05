import {
  ByokAttachmentKind,
  ByokAttachmentSource,
  ByokModelFeature,
  ByokModelInput,
  ByokModelOutput,
} from '@affine/graphql';
import { describe, expect, test } from 'vitest';

import {
  capabilitiesForUseCases,
  mergeLiveModels,
  type ModelDeclaration,
  modelUseCases,
  retainVerifiedCapabilities,
} from './model-utils';

describe('BYOK model capabilities', () => {
  test('maps richer catalog capabilities by minimum requirements', () => {
    const model: ModelDeclaration = {
      modelId: 'multimodal-tools',
      enabled: true,
      capabilities: [
        {
          input: [ByokModelInput.text, ByokModelInput.image],
          output: [ByokModelOutput.text],
          features: [ByokModelFeature.tool_calling],
          attachmentKinds: [ByokAttachmentKind.image],
          attachmentSources: [
            ByokAttachmentSource.url,
            ByokAttachmentSource.data,
            ByokAttachmentSource.bytes,
            ByokAttachmentSource.file_handle,
          ],
        },
      ],
    };

    expect(modelUseCases(model)).toEqual(['chat', 'actions', 'vision']);
  });

  test('preserves a rich capability when its represented uses stay selected', () => {
    const capability = {
      input: [ByokModelInput.text, ByokModelInput.image],
      output: [ByokModelOutput.text],
      features: [ByokModelFeature.tool_calling],
      attachmentKinds: [ByokAttachmentKind.image],
      attachmentSources: [
        ByokAttachmentSource.url,
        ByokAttachmentSource.data,
        ByokAttachmentSource.bytes,
        ByokAttachmentSource.file_handle,
      ],
    };
    const model: ModelDeclaration = {
      modelId: 'multimodal-tools',
      enabled: true,
      capabilities: [capability],
    };

    expect(
      capabilitiesForUseCases(model, ['chat', 'actions', 'vision'])
    ).toEqual([capability]);
  });

  test('drops capabilities that imply failed uses while keeping independent uses', () => {
    const embeddingCapability = {
      input: [ByokModelInput.text],
      output: [ByokModelOutput.embedding],
      features: [],
      attachmentKinds: [],
      attachmentSources: [],
    };
    const model: ModelDeclaration = {
      modelId: 'multimodal-tools',
      enabled: true,
      capabilities: [
        {
          input: [ByokModelInput.text, ByokModelInput.image],
          output: [ByokModelOutput.text],
          features: [ByokModelFeature.tool_calling],
          attachmentKinds: [ByokAttachmentKind.image],
          attachmentSources: [
            ByokAttachmentSource.url,
            ByokAttachmentSource.data,
            ByokAttachmentSource.bytes,
            ByokAttachmentSource.file_handle,
          ],
        },
        embeddingCapability,
      ],
    };

    const retained = retainVerifiedCapabilities(
      [model],
      [
        {
          modelId: model.modelId,
          checks: [
            { operation: 'chat', status: { kind: 'failed' } },
            { operation: 'tool_calling', status: { kind: 'verified' } },
            { operation: 'embedding', status: { kind: 'verified' } },
          ],
        },
      ]
    )[0];

    expect(retained).toEqual({
      ...model,
      capabilities: [embeddingCapability],
    });
    expect(modelUseCases(retained)).toEqual(['embedding']);
  });

  test('offers provider models missing from the catalog with the recommended text capabilities', () => {
    const textCapability = {
      input: [ByokModelInput.text],
      output: [ByokModelOutput.text],
      features: [ByokModelFeature.tool_calling],
      attachmentKinds: [],
      attachmentSources: [],
    };
    const catalog = [
      {
        modelId: 'image-default',
        displayName: 'Image Default',
        recommended: true,
        capabilities: [
          {
            ...textCapability,
            output: [ByokModelOutput.image],
            features: [],
          },
        ],
      },
      {
        modelId: 'chat-default',
        displayName: 'Chat Default',
        recommended: true,
        capabilities: [textCapability],
      },
    ];

    const merged = mergeLiveModels(catalog, ['chat-default', 'chat-next']);
    expect(merged.map(model => model.modelId)).toEqual([
      'image-default',
      'chat-default',
      'chat-next',
    ]);
    expect(merged[2]).toEqual({
      modelId: 'chat-next',
      displayName: 'chat-next',
      recommended: false,
      capabilities: [textCapability],
    });

    // without a recommended text model there is no safe bound to copy
    expect(mergeLiveModels([catalog[0]], ['chat-next'])).toEqual([catalog[0]]);
  });
});
