// Beacon, an invented React design system: how each Figma component is realised in code.
export const COMPONENT_CSS_SELECTORS = {
  disclosure: { main: '.bc-disclosure__summary' },
  fieldSize: { main: '.bc-field__input' },
  menuSheet: { main: '.bc-menu__button' },
  cardTile: { main: '.bc-card' },
};

export const CONTRACT = {
  disclosure: { h: 36, paddingVar: { lr: 'space/m' }, innerRadiusVar: 'radius/m', strokeOnDefault: true, strokeSides: 'all' },
  fieldSize: { h: 36, paddingVar: { lr: 'space/s' }, innerRadiusVar: 'radius/m', strokeOnDefault: true, strokeSides: 'all' },
  menuSheet: { h: 36, paddingVar: { lr: 'space/m' }, innerRadiusVar: 'radius/m', strokeOnDefault: true, strokeSides: 'all' },
  cardTile: { paddingVar: { tb: 'space/m', lr: 'space/m' }, innerRadiusVar: 'radius/l', strokeOnDefault: true, strokeSides: 'all' },
};
