import React from 'react';

/**
 * ErrorAlert Component
 * Displays error messages in a consistent, user-friendly way
 * 
 * @param {Object} props
 * @param {string} props.error - Error message to display
 * @param {string} props.title - Optional title (default: 'Error')
 * @param {Function} props.onDismiss - Optional callback when dismissed
 * @param {string} props.type - Type: 'error', 'warning', 'info' (default: 'error')
 * @param {boolean} props.dismissible - Show dismiss button (default: true)
 */
const ErrorAlert = ({ 
  error, 
  title = 'Error', 
  onDismiss = null,
  type = 'error',
  dismissible = true 
}) => {
  if (!error) return null;

  const typeStyles = {
    error: {
      container: 'bg-red-50 border-red-200',
      icon: 'text-red-600',
      title: 'text-red-900',
      message: 'text-red-700',
      button: 'text-red-500 hover:text-red-700'
    },
    warning: {
      container: 'bg-yellow-50 border-yellow-200',
      icon: 'text-yellow-600',
      title: 'text-yellow-900',
      message: 'text-yellow-700',
      button: 'text-yellow-500 hover:text-yellow-700'
    },
    info: {
      container: 'bg-blue-50 border-blue-200',
      icon: 'text-blue-600',
      title: 'text-blue-900',
      message: 'text-blue-700',
      button: 'text-blue-500 hover:text-blue-700'
    }
  };

  const styles = typeStyles[type];

  const icons = {
    error: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  };

  return (
    <div className={`border rounded-lg p-4 ${styles.container}`} role="alert">
      <div className="flex items-start">
        <div className={`flex-shrink-0 ${styles.icon}`}>
          {icons[type]}
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className={`text-sm font-semibold ${styles.title}`}>
              {title}
            </h3>
          )}
          <div className={`text-sm ${title ? 'mt-1' : ''} ${styles.message}`}>
            {typeof error === 'string' ? (
              <p>{error}</p>
            ) : (
              <pre className="whitespace-pre-wrap font-sans">{JSON.stringify(error, null, 2)}</pre>
            )}
          </div>
        </div>
        {dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className={`flex-shrink-0 ml-3 ${styles.button} transition-colors`}
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorAlert;
