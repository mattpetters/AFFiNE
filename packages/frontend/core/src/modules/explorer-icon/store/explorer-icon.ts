import type { IconData } from '@affine/component';
import { Store } from '@toeverything/infra';
import { map } from 'rxjs';

import type { WorkspaceDBService } from '../../db';

export type ExplorerType = 'doc' | 'collection' | 'folder' | 'tag';

type ExplorerIconRow = ReturnType<
  WorkspaceDBService['db']['explorerIcon']['get']
>;

/**
 * The table is shared with the custom icons (`customIcon:${iconId}`), whose
 * rows are not the icon of an entity.
 */
const toEntityIcon = (row: ExplorerIconRow) => {
  return row?.icon && 'type' in row.icon
    ? (row as { id: string; icon: IconData })
    : null;
};

export class ExplorerIconStore extends Store {
  constructor(private readonly dbService: WorkspaceDBService) {
    super();
  }

  watchIcon(type: ExplorerType, id: string) {
    return this.dbService.db.explorerIcon
      .get$(`${type}:${id}`)
      .pipe(map(toEntityIcon));
  }

  getIcon(type: ExplorerType, id: string) {
    return toEntityIcon(this.dbService.db.explorerIcon.get(`${type}:${id}`));
  }

  setIcon(options: { where: ExplorerType; id: string; icon?: IconData }) {
    const { where, id, icon } = options;
    // remove icon
    if (!icon) {
      return this.dbService.db.explorerIcon.delete(`${where}:${id}`);
    }
    // upsert icon
    return this.dbService.db.explorerIcon.create({
      id: `${where}:${id}`,
      icon,
    });
  }
}
