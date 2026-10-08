const configuredAppUrl = import.meta.env.VITE_APP_URL?.trim();

export const getAppUrl = () => {
  const fallbackUrl = typeof window === 'undefined' ? '' : window.location.origin;
  return (configuredAppUrl || fallbackUrl).replace(/\/$/, '');
};
