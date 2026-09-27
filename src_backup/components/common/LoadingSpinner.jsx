import React from 'react';

/**
 * LoadingSpinner Component
 * Displays an animated loading spinner with optional message
 * 
 * @param {Object} props
 * @param {string} props.size - Size: 'sm', 'md', 'lg', 'xl' (default: 'md')
 * @param {string} props.message - Optional text to display below spinner
 * @param {boolean} props.fullScreen - If true, takes full screen with overlay
 * @param {string} props.color - Color: 'blue', 'indigo', 'green', 'red' (default: 'indigo')
 */
const LoadingSpinner = ({ 
  size = 'md', 
  message = '', 
  fullScreen = false,
  color = 'indigo'
}) => {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-4',
    lg: 'w-12 h-12 border-4',
    xl: 'w-16 h-16 border-4'
  };

  const colors = {
    blue: 'border-blue-600',
    indigo: 'border-indigo-600',
    green: 'border-green-600',
    red: 'border-red-600',
    orange: 'border-orange-600',
    purple: 'border-purple-600'
  };

  const spinner = (
    <div className="flex flex-col items-center justify-center space-y-3">
      <div 
        className={`${sizes[size]} border-gray-200 ${colors[color]} border-t-transparent rounded-full animate-spin`}
        role="status"
        aria-label={message || 'Loading'}
      >
        <span className="sr-only">{message || 'Loading...'}</span>
      </div>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 shadow-2xl">
          {spinner}
        </div>
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;

