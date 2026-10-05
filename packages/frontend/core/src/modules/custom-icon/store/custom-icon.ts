import { Store } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { distinctUntilChanged, map } from 'rxjs';

import type { WorkspaceDBService } from '../../db';
import type { StoredCustomIcon } from '../../db/schema/schema';

export type CustomIconRecord = StoredCustomIcon & { id: string };

type ExplorerIconRow = NonNullable<
  ReturnType<WorkspaceDBService['db']['explorerIcon']['get']>
>;

// custom icons share the `explorerIcon` table with the icons of the entities,
// see the schema for the reason
const KEY_PREFIX = 'customIcon:';

const toRecord = (row: ExplorerIconRow | null): CustomIconRecord | null => {
  if (!row?.id.startsWith(KEY_PREFIX)) return null;
  // the table is synced, so the row can not be trusted to be well formed
  const icon = row.icon as Partial<StoredCustomIcon> | null;
  if (
    typeof icon?.pack !== 'string' ||
    typeof icon.name !== 'string' ||
    typeof icon.mime !== 'string' ||
    typeof icon.data !== 'string' ||
    typeof icon.createdAt !== 'number'
  ) {
    return null;
  }
  return { ...(icon as StoredCustomIcon), id: row.id.slice(KEY_PREFIX.length) };
};

const sameRows = (a: ExplorerIconRow[], b: ExplorerIconRow[]) =>
  a.length === b.length && a.every((row, index) => row === b[index]);

export class CustomIconStore extends Store {
  constructor(private readonly dbService: WorkspaceDBService) {
    super();
  }

  private get table() {
    return this.dbService.db.explorerIcon;
  }

  private customIconRows(rows: ExplorerIconRow[]) {
    return rows.filter(row => row.id.startsWith(KEY_PREFIX));
  }

  watchIcons() {
    return this.table.find$().pipe(
      map(rows => this.customIconRows(rows)),
      // not affected by the icons of the entities being changed
      distinctUntilChanged(sameRows),
      map(rows => rows.map(toRecord).filter(record => record !== null))
    );
  }

  watchIcon(id: string) {
    return this.table.get$(KEY_PREFIX + id).pipe(map(toRecord));
  }

  addIcon(icon: StoredCustomIcon) {
    const id = nanoid();
    this.table.create({ id: KEY_PREFIX + id, icon });
    return id;
  }

  deleteIcon(id: string) {
    this.table.delete(KEY_PREFIX + id);
  }

  deletePack(pack: string) {
    for (const row of this.customIconRows(this.table.find())) {
      if (toRecord(row)?.pack === pack) {
        this.table.delete(row.id);
      }
    }
  }
}
