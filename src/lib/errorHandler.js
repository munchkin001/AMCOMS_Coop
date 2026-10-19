/**
 * Error Handler Utility
 * Provides centralized error handling and user-friendly error messages
 */

/**
 * Error types and their user-friendly messages
 */
const ERROR_MESSAGES = {
  // Authentication errors
  'Invalid login credentials': 'Invalid email or password. Please try again.',
  'Email not confirmed': 'Please verify your email address before logging in.',
  'User not found': 'No account found with this email address.',
  'Invalid email': 'Please enter a valid email address.',
  
  // Database errors
  'PGRST116': 'Record not found.',
  'PGRST301': 'Insufficient permissions to access this resource.',
  '23505': 'A record with this information already exists.',
  '23503': 'Cannot delete this record because it is referenced by other records.',
  '23502': 'Required field is missing.',
  '23514': 'Invalid data format or value.',
  
  // Network errors
  'Failed to fetch': 'Network error. Please check your internet connection and try again.',
  'NetworkError': 'Unable to connect to the server. Please check your internet connection.',
  'TypeError': 'An unexpected error occurred. Please try again.',
  
  // Validation errors
  'validation_error': 'Please check your input and try again.',
  'missing_required_field': 'Please fill in all required fields.',
  'invalid_format': 'Invalid data format. Please check your input.',
  
  // Permission errors
  'permission_denied': 'You do not have permission to perform this action.',
  'unauthorized': 'You must be logged in to perform this action.',
  'forbidden': 'Access denied. You do not have sufficient privileges.',
  
  // Business logic errors
  'insufficient_balance': 'Insufficient balance to complete this transaction.',
  'duplicate_entry': 'This record already exists.',
  'invalid_transaction': 'Invalid transaction. Please check the details and try again.',
  'operation_failed': 'Operation failed. Please try again or contact support.',
  
  // Generic
  'default': 'An error occurred. Please try again or contact support if the problem persists.'
};

export const getDataLoadErrorMessage = (error, resource = 'data') => {
  console.error(`Unable to load ${resource}:`, error);
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return `You're offline. Reconnect to load ${resource}.`;
  }
  return `We couldn't load ${resource}. Please try again.`;
};

/**
 * Parse and return user-friendly error message
 * @param {Error|Object|string} error - Error object or message
 * @returns {string} User-friendly error message
 */
export const getErrorMessage = (error) => {
  if (!error) {
    return ERROR_MESSAGES.default;
  }

  // If error is a string
  if (typeof error === 'string') {
    return ERROR_MESSAGES[error] || error;
  }

  // If error is an Error object
  if (error instanceof Error) {
    const message = error.message;
    
    // Check for known error messages
    for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
      if (message.includes(key)) {
        return value;
      }
    }
    
    return message || ERROR_MESSAGES.default;
  }

  // If error is a Supabase error object
  if (error.message) {
    // Check for Postgres error codes
    if (error.code) {
      const errorMsg = ERROR_MESSAGES[error.code];
      if (errorMsg) return errorMsg;
    }
    
    // Check for known error messages
    for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
      if (error.message.includes(key)) {
        return value;
      }
    }
    
    return error.message;
  }

  // If error has a custom error message
  if (error.error) {
    return getErrorMessage(error.error);
  }

  return ERROR_MESSAGES.default;
};

/**
 * Log error to console (can be extended to send to error tracking service)
 * @param {Error} error - Error object
 * @param {Object} context - Additional context information
 */
export const logError = (error, context = {}) => {
  console.error('Error occurred:', {
    error,
    message: error?.message || error,
    stack: error?.stack,
    context,
    timestamp: new Date().toISOString()
  });

  // TODO: Send to error tracking service (e.g., Sentry, LogRocket)
  // if (import.meta.env.PROD) {
  //   ErrorTracker.captureException(error, context);
  // }
};

/**
 * Handle API errors consistently
 * @param {Error} error - Error from API call
 * @param {Object} options - Options for error handling
 * @returns {Object} Standardized error response
 */
export const handleApiError = (error, options = {}) => {
  const {
    operation = 'operation',
    showToast = true,
    logToConsole = true
  } = options;

  const errorMessage = getErrorMessage(error);

  if (logToConsole) {
    logError(error, { operation });
  }

  return {
    success: false,
    error: errorMessage,
    originalError: error
  };
};

/**
 * Validate Supabase response and return standardized format
 * @param {Object} response - Supabase response { data, error }
 * @param {string} operation - Description of the operation
 * @returns {Object} Standardized response { success, data, error }
 */
export const validateSupabaseResponse = (response, operation = 'operation') => {
  const { data, error } = response;

  if (error) {
    const errorMessage = getErrorMessage(error);
    logError(error, { operation });
    
    return {
      success: false,
      data: null,
      error: errorMessage,
      originalError: error
    };
  }

  return {
    success: true,
    data,
    error: null
  };
};

/**
 * Create a safe async wrapper that handles errors
 * @param {Function} asyncFn - Async function to wrap
 * @param {Object} options - Options for error handling
 * @returns {Function} Wrapped function
 */
export const withErrorHandling = (asyncFn, options = {}) => {
  return async (...args) => {
    try {
      const result = await asyncFn(...args);
      return {
        success: true,
        data: result,
        error: null
      };
    } catch (error) {
      return handleApiError(error, options);
    }
  };
};

/**
 * Check if error is a network error
 * @param {Error} error - Error object
 * @returns {boolean}
 */
export const isNetworkError = (error) => {
  if (!error) return false;
  
  const message = error.message || error.toString();
  return (
    message.includes('Failed to fetch') ||
    message.includes('Network') ||
    message.includes('ERR_INTERNET_DISCONNECTED') ||
    error.name === 'NetworkError'
  );
};

/**
 * Check if error is an authentication error
 * @param {Error} error - Error object
 * @returns {boolean}
 */
export const isAuthError = (error) => {
  if (!error) return false;
  
  const message = error.message || error.toString();
  return (
    message.includes('Invalid login credentials') ||
    message.includes('not authenticated') ||
    message.includes('JWT') ||
    message.includes('token') ||
    error.status === 401
  );
};

/**
 * Check if error is a permission error
 * @param {Error} error - Error object
 * @returns {boolean}
 */
export const isPermissionError = (error) => {
  if (!error) return false;
  
  const message = error.message || error.toString();
  return (
    message.includes('permission') ||
    message.includes('forbidden') ||
    message.includes('PGRST301') ||
    error.status === 403
  );
};

/**
 * Format validation errors from form validation
 * @param {Object} errors - Validation errors object
 * @returns {string} Formatted error message
 */
export const formatValidationErrors = (errors) => {
  if (!errors || Object.keys(errors).length === 0) {
    return '';
  }

  const errorMessages = Object.entries(errors)
    .map(([field, message]) => `${field}: ${message}`)
    .join(', ');

  return errorMessages;
};

export default {
  getErrorMessage,
  logError,
  handleApiError,
  validateSupabaseResponse,
  withErrorHandling,
  isNetworkError,
  isAuthError,
  isPermissionError,
  formatValidationErrors
};
