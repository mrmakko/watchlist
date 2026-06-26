// Manual grouping colours for a card's left border. 'none' = default (black, i.e. no group).
export const COLORS = {
  none: '#000000',
  red: '#e5484d',
  amber: '#f5a623',
  green: '#30a46c',
  blue: '#4593e8',
  purple: '#8e4ec6'
};

// Order shown in the right-click palette.
export const COLOR_KEYS = ['none', 'red', 'amber', 'green', 'blue', 'purple'];

export const colorOf = (key) => COLORS[key] || COLORS.none;
