/**
 * Portal Color System
 * Each portal/role has a unique color that marks all transactions/records they create
 */

export const PORTAL_COLORS = {
  CHAIRMAN: {
    name: 'Chairman',
    primary: 'green',
    bgLight: 'bg-green-50',
    bgMedium: 'bg-green-100',
    bgDark: 'bg-green-600',
    text: 'text-green-800',
    textDark: 'text-green-600',
    border: 'border-green-200',
    hover: 'hover:bg-green-700',
    ring: 'ring-green-500'
  },
  MANAGER: {
    name: 'Manager',
    primary: 'blue',
    bgLight: 'bg-blue-50',
    bgMedium: 'bg-blue-100',
    bgDark: 'bg-blue-600',
    text: 'text-blue-800',
    textDark: 'text-blue-600',
    border: 'border-blue-200',
    hover: 'hover:bg-blue-700',
    ring: 'ring-blue-500'
  },
  TREASURER: {
    name: 'Treasurer',
    primary: 'teal',
    bgLight: 'bg-teal-50',
    bgMedium: 'bg-teal-100',
    bgDark: 'bg-teal-600',
    text: 'text-teal-800',
    textDark: 'text-teal-600',
    border: 'border-teal-200',
    hover: 'hover:bg-teal-700',
    ring: 'ring-teal-500'
  },
  BOOKKEEPER: {
    name: 'Bookkeeper',
    primary: 'purple',
    bgLight: 'bg-purple-50',
    bgMedium: 'bg-purple-100',
    bgDark: 'bg-purple-600',
    text: 'text-purple-800',
    textDark: 'text-purple-600',
    border: 'border-purple-200',
    hover: 'hover:bg-purple-700',
    ring: 'ring-purple-500'
  },
  INVENTORY: {
    name: 'Inventory Staff',
    primary: 'orange',
    bgLight: 'bg-orange-50',
    bgMedium: 'bg-orange-100',
    bgDark: 'bg-orange-600',
    text: 'text-orange-800',
    textDark: 'text-orange-600',
    border: 'border-orange-200',
    hover: 'hover:bg-orange-700',
    ring: 'ring-orange-500'
  },
  MEMBER: {
    name: 'Member',
    primary: 'indigo',
    bgLight: 'bg-indigo-50',
    bgMedium: 'bg-indigo-100',
    bgDark: 'bg-indigo-600',
    text: 'text-indigo-800',
    textDark: 'text-indigo-600',
    border: 'border-indigo-200',
    hover: 'hover:bg-indigo-700',
    ring: 'ring-indigo-500'
  }
};

/**
 * Get portal color classes based on role
 * @param {string} role - Role name (CHAIRMAN, MANAGER, TREASURER, etc.)
 * @returns {object} Color classes for the role
 */
export const getPortalColor = (role) => {
  return PORTAL_COLORS[role.toUpperCase()] || PORTAL_COLORS.MEMBER;
};

/**
 * Get badge classes for transaction records
 * @param {string} recordedBy - Role that recorded the transaction
 * @returns {string} CSS classes for the badge
 */
export const getRecordBadgeClasses = (recordedBy) => {
  const color = getPortalColor(recordedBy);
  return `${color.bgMedium} ${color.text} border ${color.border}`;
};

/**
 * Get border left accent for list items
 * @param {string} recordedBy - Role that recorded the transaction
 * @returns {string} CSS classes for border-left accent
 */
export const getRecordAccentClasses = (recordedBy) => {
  const colorMap = {
    CHAIRMAN: 'border-l-4 border-l-green-500',
    MANAGER: 'border-l-4 border-l-blue-500',
    TREASURER: 'border-l-4 border-l-teal-500',
    BOOKKEEPER: 'border-l-4 border-l-purple-500',
    INVENTORY: 'border-l-4 border-l-orange-500',
    MEMBER: 'border-l-4 border-l-indigo-500'
  };
  return colorMap[recordedBy.toUpperCase()] || 'border-l-4 border-l-gray-500';
};

/**
 * Get dot indicator for role
 * @param {string} recordedBy - Role that recorded the transaction
 * @returns {string} CSS classes for dot indicator
 */
export const getRoleDotClasses = (recordedBy) => {
  const colorMap = {
    CHAIRMAN: 'bg-green-500',
    MANAGER: 'bg-blue-500',
    TREASURER: 'bg-teal-500',
    BOOKKEEPER: 'bg-purple-500',
    INVENTORY: 'bg-orange-500',
    MEMBER: 'bg-indigo-500'
  };
  return colorMap[recordedBy.toUpperCase()] || 'bg-gray-500';
};
