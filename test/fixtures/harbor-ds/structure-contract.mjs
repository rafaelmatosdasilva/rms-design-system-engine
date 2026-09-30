// Harbor, a fictional design system: how each Figma component is realised in code.
export const COMPONENT_CSS_SELECTORS = {
  button: { main: '.hb-button' },
  badge: { main: '.hb-badge' },
  iconButton: { main: '.hb-icon-button' },
};

export const CONTRACT = {
  button: { h: 36, paddingVar: { tb: 'space/2', lr: 'space/3' }, innerRadiusVar: 'radius/control', fontSizeVar: 'body', fontWeightVar: 'body', strokeOnDefault: false },
  badge: { h: 20, paddingVar: { tb: 'space/2', lr: 'space/2' }, innerRadiusVar: 'radius/control', fontSizeVar: 'label', fontWeightVar: 'label', strokeOnDefault: false },
  iconButton: { h: 36, paddingVar: { tb: 'space/2', lr: 'space/2' }, innerRadiusVar: 'radius/control', strokeOnDefault: false },
};
