import { useState, useCallback } from 'react';

/**
 * Custom hook for form state management and validation
 * 
 * @param {Object} initialValues - Initial form values
 * @param {Function} validate - Validation function that returns errors object
 * @param {Function} onSubmit - Submit handler function
 * @returns {Object} Form utilities
 */
export const useForm = (initialValues = {}, validate = null, onSubmit = null) => {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Handle input change
   */
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setValues(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }, [errors]);

  /**
   * Handle input blur (mark field as touched)
   */
  const handleBlur = useCallback((e) => {
    const { name } = e.target;
    setTouched(prev => ({
      ...prev,
      [name]: true
    }));

    // Validate field on blur if validation function provided
    if (validate) {
      const validationErrors = validate(values);
      if (validationErrors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: validationErrors[name]
        }));
      }
    }
  }, [values, validate]);

  /**
   * Set a specific field value programmatically
   */
  const setFieldValue = useCallback((name, value) => {
    setValues(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  /**
   * Set a specific field error
   */
  const setFieldError = useCallback((name, error) => {
    setErrors(prev => ({
      ...prev,
      [name]: error
    }));
  }, []);

  /**
   * Set all field values
   */
  const setFormValues = useCallback((newValues) => {
    setValues(newValues);
  }, []);

  /**
   * Reset form to initial values
   */
  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(async (e) => {
    if (e) {
      e.preventDefault();
    }

    // Mark all fields as touched
    const allTouched = Object.keys(values).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    setTouched(allTouched);

    // Validate all fields
    let validationErrors = {};
    if (validate) {
      validationErrors = validate(values);
      setErrors(validationErrors);
    }

    // If there are errors, don't submit
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    // Submit form
    if (onSubmit) {
      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } catch (error) {
        console.error('Form submission error:', error);
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [values, validate, onSubmit]);

  /**
   * Check if form has errors
   */
  const hasErrors = Object.keys(errors).length > 0;

  /**
   * Check if form is valid (no errors and has been touched)
   */
  const isValid = !hasErrors && Object.keys(touched).length > 0;

  /**
   * Check if a specific field has error and has been touched
   */
  const getFieldError = useCallback((name) => {
    return touched[name] && errors[name] ? errors[name] : null;
  }, [touched, errors]);

  /**
   * Check if field has error
   */
  const hasFieldError = useCallback((name) => {
    return touched[name] && !!errors[name];
  }, [touched, errors]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    hasErrors,
    isValid,
    handleChange,
    handleBlur,
    handleSubmit,
    setFieldValue,
    setFieldError,
    setFormValues,
    resetForm,
    getFieldError,
    hasFieldError
  };
};

/**
 * Common validation rules
 */
export const validators = {
  required: (value) => {
    if (!value || (typeof value === 'string' && !value.trim())) {
      return 'This field is required';
    }
    return null;
  },

  email: (value) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Please enter a valid email address';
    }
    return null;
  },

  minLength: (min) => (value) => {
    if (value && value.length < min) {
      return `Must be at least ${min} characters`;
    }
    return null;
  },

  maxLength: (max) => (value) => {
    if (value && value.length > max) {
      return `Must be no more than ${max} characters`;
    }
    return null;
  },

  numeric: (value) => {
    if (value && isNaN(value)) {
      return 'Must be a number';
    }
    return null;
  },

  positive: (value) => {
    if (value && Number(value) <= 0) {
      return 'Must be a positive number';
    }
    return null;
  },

  min: (min) => (value) => {
    if (value && Number(value) < min) {
      return `Must be at least ${min}`;
    }
    return null;
  },

  max: (max) => (value) => {
    if (value && Number(value) > max) {
      return `Must be no more than ${max}`;
    }
    return null;
  },

  matches: (pattern, message = 'Invalid format') => (value) => {
    if (value && !pattern.test(value)) {
      return message;
    }
    return null;
  },

  phoneNumber: (value) => {
    if (value && !/^[\d\s\-\+\(\)]+$/.test(value)) {
      return 'Please enter a valid phone number';
    }
    return null;
  }
};

/**
 * Combine multiple validators
 */
export const combineValidators = (...validatorFns) => (value) => {
  for (const validator of validatorFns) {
    const error = validator(value);
    if (error) return error;
  }
  return null;
};

export default useForm;
