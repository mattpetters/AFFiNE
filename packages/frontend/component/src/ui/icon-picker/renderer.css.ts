import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const customIcon = style({
  // inline, so it can replace an emoji within a line of text
  display: 'inline-block',
  verticalAlign: 'middle',
  width: '1em',
  height: '1em',
  objectFit: 'contain',
});

export const customIconPlaceholder = style({
  display: 'inline-block',
  verticalAlign: 'middle',
  width: '1em',
  height: '1em',
  borderRadius: '20%',
  backgroundColor: cssVarV2('layer/background/tertiary'),
});
