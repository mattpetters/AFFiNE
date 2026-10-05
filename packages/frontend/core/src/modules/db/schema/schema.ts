import type { IconData } from '@affine/component';
import {
  type DBSchemaBuilder,
  f,
  type FieldSchemaBuilder,
  type ORMEntity,
  t,
} from '@toeverything/infra';
import { nanoid } from 'nanoid';

import type { WorkspacePropertyType } from '../../workspace-property';

const integrationType = f.enum('readwise');

/**
 * An uploaded custom icon, the image is inlined so it syncs with the table.
 */
export type StoredCustomIcon = {
  /**
   * name of the pack this icon belongs to
   */
  pack: string;
  name: string;
  mime: string;
  /**
   * the image in base64, since there is no binary field
   */
  data: string;
  createdAt: number;
};

export const AFFiNE_WORKSPACE_DB_SCHEMA = {
  folders: {
    id: f.string().primaryKey().optional().default(nanoid),
    parentId: f.string().optional(),
    data: f.string(),
    type: f.string(),
    index: f.string(),
  },
  docProperties: t.document({
    // { [`custom:{customPropertyId}`]: any }
    id: f.string().primaryKey(),
    primaryMode: f.string().optional(),
    edgelessColorTheme: f.string().optional(),
    journal: f.string().optional(),
    pageWidth: f.string().optional(),
    isTemplate: f.boolean().optional(),
    integrationType: integrationType.optional(),
    createdBy: f.string().optional(),
    updatedBy: f.string().optional(),
  }),
  docCustomPropertyInfo: {
    id: f.string().primaryKey().optional().default(nanoid),
    name: f.string().optional(),
    type: f.string() as FieldSchemaBuilder<WorkspacePropertyType, false, false>,
    show: f.enum('always-show', 'always-hide', 'hide-when-empty').optional(),
    index: f.string().optional(),
    icon: f.string().optional(),
    additionalData: f.json().optional(),
    isDeleted: f.boolean().optional(),
    // we will keep deleted properties in the database, for override legacy data
  },
  pinnedCollections: {
    collectionId: f.string().primaryKey(),
    index: f.string(),
  },
  explorerIcon: {
    /**
     * `${doc|collection|folder|tag}:${id}` for the icon of an entity,
     * `customIcon:${iconId}` for an uploaded custom icon.
     *
     * Custom icons live in this table since the server only syncs an
     * allowlist of workspace db tables, a table of their own never syncs.
     */
    id: f.string().primaryKey(),
    icon: f.json<IconData | StoredCustomIcon>(),
  },
} as const satisfies DBSchemaBuilder;
export type AFFiNEWorkspaceDbSchema = typeof AFFiNE_WORKSPACE_DB_SCHEMA;

export type DocProperties = ORMEntity<AFFiNEWorkspaceDbSchema['docProperties']>;
export type DocCustomPropertyInfo = ORMEntity<
  AFFiNEWorkspaceDbSchema['docCustomPropertyInfo']
>;

export const AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA = {
  favorite: {
    key: f.string().primaryKey(),
    index: f.string(),
  },
  settings: {
    key: f.string().primaryKey(),
    value: f.json(),
  },
  docIntegrationRef: {
    // docId as primary key
    id: f.string().primaryKey(),
    type: integrationType,
    /**
     * Identify **affine user** and **integration type** and **integration account**
     * Used to quickly find user's all integrations
     */
    integrationId: f.string(),
    refMeta: f.json(),
  },
} as const satisfies DBSchemaBuilder;
export type AFFiNEWorkspaceUserdataDbSchema =
  typeof AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA;
export type DocIntegrationRef = ORMEntity<
  AFFiNEWorkspaceUserdataDbSchema['docIntegrationRef']
>;
