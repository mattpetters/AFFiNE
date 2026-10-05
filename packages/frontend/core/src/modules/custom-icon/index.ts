import type { Framework } from '@toeverything/infra';

import { WorkspaceDBService } from '../db';
import { WorkspaceScope } from '../workspace';
import { CustomIconService } from './services/custom-icon';
import { CustomIconStore } from './store/custom-icon';

export { CustomIconService } from './services/custom-icon';
export { WorkspaceCustomIconProvider } from './view/custom-icon-provider';

export function configureCustomIconModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .store(CustomIconStore, [WorkspaceDBService])
    .service(CustomIconService, [CustomIconStore]);
}
