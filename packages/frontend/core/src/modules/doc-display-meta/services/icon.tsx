import { type IconData, IconRenderer, IconType } from '@affine/component';
import * as litIcons from '@blocksuite/icons/lit';
import { cssVarV2 } from '@toeverything/theme/v2';
import { html } from 'lit';

export const getDocIconComponent = (icon: IconData) => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <IconRenderer data={icon} {...props} />
  );
  Icon.displayName = 'DocIcon';
  return Icon;
};

const customIconPlaceholder = html`<span
  style="display: inline-block; vertical-align: middle; width: 1em; height: 1em; border-radius: 20%; background: ${cssVarV2(
    'layer/background/tertiary'
  )};"
></span>`;

// always an <img>, so scripts in an uploaded svg can never run
const customIconImage = (url: string) =>
  html`<img
    src=${url}
    alt=""
    draggable="false"
    style="display: inline-block; vertical-align: middle; width: 1em; height: 1em; object-fit: contain;"
  />`;

/**
 * @param getCustomIconUrl the url of the image of a custom icon, `null` if it is not available
 */
export const getDocIconComponentLit = (
  icon: IconData,
  getCustomIconUrl: (iconId: string) => string | null
) => {
  const customIconUrl =
    icon.type === IconType.Custom ? getCustomIconUrl(icon.iconId) : null;

  return () => {
    if (icon.type === IconType.Emoji) {
      return html`<div class="icon">${icon.unicode}</div>`;
    }
    if (icon.type === IconType.AffineIcon) {
      return html`<div
        style="color: ${icon.color}; display: flex; align-items: center; justify-content: center;"
      >
        ${litIcons[`${icon.name}Icon` as keyof typeof litIcons]()}
      </div>`;
    }
    if (icon.type === IconType.Custom) {
      return customIconUrl
        ? customIconImage(customIconUrl)
        : customIconPlaceholder;
    }
    return null;
  };
};
