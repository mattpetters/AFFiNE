import { CUSTOM_ICON_MAX_SIZE, CUSTOM_ICON_MIME } from '@affine/component';
import { Unzip } from '@blocksuite/affine/widgets/linked-doc';

// ponytail: archives are inflated in memory, raise the cap together with a
// streaming unzip if larger packs are ever needed
export const CUSTOM_ICON_ZIP_MAX_SIZE = 50 * 1024 * 1024;

export type IconFile = {
  name: string;
  blob: Blob;
  /**
   * name of the archive the icon comes from
   */
  pack?: string;
};

const splitExtension = (fileName: string) => {
  const index = fileName.lastIndexOf('.');
  return index === -1
    ? ([fileName, ''] as const)
    : ([fileName.slice(0, index), fileName.slice(index + 1)] as const);
};

const toIconFile = (
  file: Blob,
  fileName: string,
  pack?: string
): IconFile | null => {
  const [name, extension] = splitExtension(fileName);
  const mime = CUSTOM_ICON_MIME[extension.toLowerCase()];
  if (
    !mime ||
    !name ||
    (file.type && !file.type.startsWith('image/')) ||
    file.size === 0 ||
    file.size > CUSTOM_ICON_MAX_SIZE
  ) {
    return null;
  }
  // the stored type is decided by the extension, never by what the file claims
  return { name, blob: new Blob([file], { type: mime }), pack };
};

/**
 * Picks the files that are allowed to become a custom icon out of the user
 * selected files, zip archives are expanded.
 */
export async function collectIconFiles(files: File[]) {
  const icons: IconFile[] = [];
  const skipped: string[] = [];
  const collect = (file: Blob, fileName: string, pack?: string) => {
    const icon = toIconFile(file, fileName, pack);
    if (icon) {
      icons.push(icon);
    } else {
      skipped.push(fileName);
    }
  };

  for (const file of files) {
    const [name, extension] = splitExtension(file.name);
    if (extension.toLowerCase() !== 'zip') {
      collect(file, file.name);
      continue;
    }
    if (file.size > CUSTOM_ICON_ZIP_MAX_SIZE) {
      skipped.push(file.name);
      continue;
    }
    try {
      const unzip = new Unzip();
      await unzip.load(file);
      for (const { path, content } of unzip) {
        // directory
        if (path.endsWith('/')) continue;
        collect(content, path.slice(path.lastIndexOf('/') + 1), name);
      }
    } catch (err) {
      console.error(err);
      skipped.push(file.name);
    }
  }

  return { icons, skipped };
}
