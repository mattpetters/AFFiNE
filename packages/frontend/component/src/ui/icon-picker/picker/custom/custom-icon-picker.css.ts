import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const hint = style({
  padding: '0px 12px 4px 12px',
  fontSize: 12,
  lineHeight: '18px',
  color: cssVarV2.text.secondary,
});

export const empty = style([
  hint,
  {
    flexGrow: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
]);

export const packHeader = style({
  justifyContent: 'space-between',
  gap: 8,
});

export const packName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const item = style({
  position: 'relative',
});

export const deleteIcon = style({
  position: 'absolute',
  top: 0,
  right: 0,
  width: 12,
  height: 12,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  cursor: 'pointer',
  color: cssVarV2.button.pureWhiteText,
  backgroundColor: cssVarV2.status.error,
  opacity: 0,
  selectors: {
    [`${item}:hover &, &:focus-visible`]: {
      opacity: 1,
    },
  },
});
