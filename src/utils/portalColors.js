/**
 * Portal Color Utilities
 * Centralized color schemes for each portal role
 */

export const portalColors = {
  member: {
    primary: 'indigo',
    sidebar: 'bg-white',
    activeNav: 'bg-indigo-50 text-indigo-700',
    header: 'from-indigo-700 to-indigo-800',
    accent: 'text-indigo-600',
  },
  chairman: {
    primary: 'purple',
    sidebar: 'bg-white',
    activeNav: 'bg-blue-50 text-blue-700',
    header: 'from-blue-700 to-blue-800',
    accent: 'text-blue-600',
  },
  manager: {
    primary: 'blue',
    sidebar: 'bg-white',
    activeNav: 'bg-blue-50 text-blue-700',
    header: 'from-blue-700 to-blue-800',
    accent: 'text-blue-600',
  },
  treasurer: {
    primary: 'green',
    sidebar: 'bg-white',
    activeNav: 'bg-green-50 text-green-700',
    header: 'from-green-700 to-green-800',
    accent: 'text-green-600',
  },
  bookkeeper: {
    primary: 'orange',
    sidebar: 'bg-white',
    activeNav: 'bg-orange-50 text-orange-700',
    header: 'from-orange-700 to-orange-800',
    accent: 'text-orange-600',
  },
  inventory: {
    primary: 'teal',
    sidebar: 'bg-white',
    activeNav: 'bg-teal-50 text-teal-700',
    header: 'from-teal-700 to-teal-800',
    accent: 'text-teal-600',
  },
};

export const getPortalColor = (role) => {
  return portalColors[role] || portalColors.member;
};
