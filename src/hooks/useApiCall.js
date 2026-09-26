import { useState, useCallback } from 'react';
import { getErrorMessage, logError } from '../lib/errorHandler';

/**
 * Custom hook for handling API calls with loading and error states
 * 
 * @returns {Object} API call utilities
 */
export const useApiCall = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  /**
   * Execute an API call with automatic loading and error handling
   * @param {Function} apiFunction - Async function that makes the API call
   * @param {Object} options - Options
   * @returns {Promise<Object>} Result
   */
  const execute = useCallback(async (apiFunction, options = {}) => {
    const {
      onSuccess = null,
      onError = null,
      setLoadingState = true,
      operation = 'API call'
    } = options;

    try {
      if (setLoadingState) {
        setLoading(true);
      }
      setError(null);

      const result = await apiFunction();

      // Check if result indicates failure
      if (result && result.success === false) {
        const errorMsg = getErrorMessage(result.error || result.originalError);
        setError(errorMsg);
        
        if (onError) {
          onError(errorMsg, result);
        }
        
        return result;
      }

      // Success
      setData(result.data || result);
      
      if (onSuccess) {
        onSuccess(result.data || result);
      }

      return result;

    } catch (err) {
      const errorMsg = getErrorMessage(err);
      setError(errorMsg);
      logError(err, { operation });

      if (onError) {
        onError(errorMsg, err);
      }

      return {
        success: false,
        data: null,
        error: errorMsg,
        originalError: err
      };

    } finally {
      if (setLoadingState) {
        setLoading(false);
      }
    }
  }, []);

  /**
   * Reset all states
   */
  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  /**
   * Clear only the error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    data,
    execute,
    reset,
    clearError,
    setData,
    setError,
    setLoading
  };
};

export default useApiCall;
