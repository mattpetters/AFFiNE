import { Store } from '@toeverything/infra';
import { nanoid } from 'nanoid';

import type { WorkspaceDBService } from '../../db';

export class CustomIconStore extends Store {
  constructor(private readonly dbService: WorkspaceDBService) {
    super();
  }

  watchIcons() {
    return this.dbService.db.customIcon.find$();
  }

  watchIconData(id: string) {
    return this.dbService.db.customIconData.get$(id);
  }

  addIcon(icon: {
    pack: string;
    name: string;
    createdAt: number;
    mime: string;
    data: string;
  }) {
    const { mime, data, ...info } = icon;
    const id = nanoid();
    // the image first, so a listed icon always has one
    this.dbService.db.customIconData.create({ id, mime, data });
    return this.dbService.db.customIcon.create({ id, ...info });
  }

  deleteIcon(id: string) {
    this.dbService.db.customIcon.delete(id);
    this.dbService.db.customIconData.delete(id);
  }

  deletePack(pack: string) {
    for (const icon of this.dbService.db.customIcon.find({ pack })) {
      this.deleteIcon(icon.id);
    }
  }
}
