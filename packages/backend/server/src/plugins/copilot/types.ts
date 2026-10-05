import { z } from 'zod';

import type { Turn } from './core/types';
import type { ResolvedPrompt } from './prompt';
import { PromptMessageSchema, PureMessageSchema } from './providers/types';
import {
  type SessionFocus,
  TurnScopeSnapshotSchema,
} from './runtime/contracts/shared';

const takeFirst = (v: unknown) => (Array.isArray(v) ? v[0] : v);

const zBool = z.preprocess(val => {
  const s = String(takeFirst(val)).toLowerCase();
  return ['true', '1', 'yes'].includes(s);
}, z.boolean().default(false));

const zMaybeString = z.preprocess(val => {
  const s = takeFirst(val);
  return s === '' || s == null ? undefined : s;
}, z.string().min(1).optional());

const ToolsConfigSchema = z.preprocess(
  val => {
    // if val is a string, try to parse it as JSON
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return {};
      }
    }
    return val || {};
  },
  z.record(z.enum(['searchWorkspace', 'readingDocs']), z.boolean()).default({})
);

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

// Route choices backed by a workspace BYOK profile carry the explicit
// profile/model target in their id, so clients can send them as routeTargetId.
const BYOK_ROUTE_TARGET_PREFIX = 'byok:';

export function byokRouteTargetId(profileId: string, modelId: string) {
  return `${BYOK_ROUTE_TARGET_PREFIX}${profileId}:${modelId}`;
}

export function parseByokRouteTargetId(routeTargetId: string) {
  if (!routeTargetId.startsWith(BYOK_ROUTE_TARGET_PREFIX)) return undefined;
  const target = routeTargetId.slice(BYOK_ROUTE_TARGET_PREFIX.length);
  // model ids are opaque and may contain ':', profile ids never do
  const separator = target.indexOf(':');
  if (separator <= 0 || separator === target.length - 1) return undefined;
  return {
    profileId: target.slice(0, separator),
    modelId: target.slice(separator + 1),
  };
}

export const ChatQuerySchema = z
  .object({
    messageId: zMaybeString,
    profileId: zMaybeString,
    modelId: zMaybeString,
    routeTargetId: zMaybeString,
    byokLeaseId: zMaybeString,
    retry: zBool,
    reasoning: zBool,
    webSearch: zBool,
    toolsConfig: ToolsConfigSchema,
  })
  .catchall(z.string())
  .superRefine((value, context) => {
    if (!!value.profileId !== !!value.modelId) {
      context.addIssue({
        code: 'custom',
        message: 'profileId and modelId must be provided together',
      });
    }
    for (const field of ['requirements', 'deployment', 'profiles', 'presets']) {
      if (Object.hasOwn(value, field)) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is owned by the native route policy`,
        });
      }
    }
  })
  .transform(
    ({
      messageId,
      profileId,
      modelId,
      routeTargetId,
      byokLeaseId,
      retry,
      reasoning,
      webSearch,
      toolsConfig,
      ...params
    }) => {
      const byokTarget =
        !profileId && routeTargetId
          ? parseByokRouteTargetId(routeTargetId)
          : undefined;
      return {
        messageId,
        profileId: byokTarget?.profileId ?? profileId,
        modelId: byokTarget?.modelId ?? modelId,
        routeTargetId: byokTarget ? undefined : routeTargetId,
        byokLeaseId,
        retry,
        reasoning,
        webSearch,
        toolsConfig,
        params,
      };
    }
  );

// ======== ChatMessage ========

export const ChatMessageSchema = PromptMessageSchema.extend({
  id: z.string().optional(),
  scopeSnapshot: TurnScopeSnapshotSchema.nullable().optional(),
  createdAt: z.date(),
}).strict();
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatHistorySchema = z
  .object({
    userId: z.string(),
    sessionId: z.string(),
    workspaceId: z.string(),
    docId: z.string().nullable(),
    parentSessionId: z.string().nullable(),
    pinned: z.boolean(),
    title: z.string().nullable(),

    action: z.string().nullable(),
    promptName: z.string(),
    messages: z.array(ChatMessageSchema),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type ChatHistory = z.infer<typeof ChatHistorySchema>;

export const SubmittedMessageSchema = PureMessageSchema.extend({
  sessionId: z.string(),
  content: z.string().optional(),
}).strict();
export type SubmittedMessage = z.infer<typeof SubmittedMessageSchema>;

// ======== Chat Session ========

export type ChatSessionOptions = {
  userId: string;
  workspaceId: string;
  docId: string | null;
  promptName: string;
  pinned: boolean;
  reuseLatestChat?: boolean;
  personal?: boolean;
};

export type ChatSessionForkOptions = {
  userId: string;
  sessionId: string;
  workspaceId: string;
  docId: string;
  latestMessageId?: string;
  personal?: boolean;
};

export type ChatSessionState = {
  userId: string;
  sessionId: string;
  workspaceId: string;
  docId: string | null;
  turns: Turn[];
  focus: SessionFocus;
  prompt: ResolvedPrompt;
};
