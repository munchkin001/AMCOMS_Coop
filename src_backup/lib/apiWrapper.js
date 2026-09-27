/**
 * API Wrapper Utility
 * Provides consistent API call patterns with error handling and loading states
 */

import { supabase } from './supabase';
import { validateSupabaseResponse } from './errorHandler';

/**
 * Generic database query wrapper
 * @param {Function} queryFn - Function that returns a Supabase query builder
 * @param {Object} options - Options
 * @returns {Promise<Object>} Standardized response
 */
export const dbQuery = async (queryFn, options = {}) => {
  const { operation = 'database query' } = options;

  try {
    const response = await queryFn();
    return validateSupabaseResponse(response, operation);
  } catch (error) {
    console.error(`Error in ${operation}:`, error);
    return {
      success: false,
      data: null,
      error: error.message || 'Database operation failed',
      originalError: error
    };
  }
};

/**
 * Fetch single record by ID
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @param {string} select - Fields to select (default: '*')
 * @returns {Promise<Object>}
 */
export const fetchById = async (table, id, select = '*') => {
  return dbQuery(
    () => supabase.from(table).select(select).eq('id', id).single(),
    { operation: `fetch ${table} by ID` }
  );
};

/**
 * Fetch all records from a table with optional filters
 * @param {string} table - Table name
 * @param {Object} options - Query options
 * @returns {Promise<Object>}
 */
export const fetchAll = async (table, options = {}) => {
  const {
    select = '*',
    filter = {},
    orderBy = null,
    ascending = true,
    limit = null,
    offset = null
  } = options;

  return dbQuery(
    () => {
      let query = supabase.from(table).select(select);

      // Apply filters
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          query = query.eq(key, value);
        }
      });

      // Apply ordering
      if (orderBy) {
        query = query.order(orderBy, { ascending });
      }

      // Apply pagination
      if (limit) {
        query = query.limit(limit);
      }
      if (offset) {
        query = query.range(offset, offset + (limit || 10) - 1);
      }

      return query;
    },
    { operation: `fetch all ${table}` }
  );
};

/**
 * Insert a new record
 * @param {string} table - Table name
 * @param {Object} data - Data to insert
 * @param {string} select - Fields to return (default: '*')
 * @returns {Promise<Object>}
 */
export const insertRecord = async (table, data, select = '*') => {
  return dbQuery(
    () => supabase.from(table).insert(data).select(select).single(),
    { operation: `insert into ${table}` }
  );
};

/**
 * Insert multiple records
 * @param {string} table - Table name
 * @param {Array} dataArray - Array of records to insert
 * @param {string} select - Fields to return (default: '*')
 * @returns {Promise<Object>}
 */
export const insertMany = async (table, dataArray, select = '*') => {
  return dbQuery(
    () => supabase.from(table).insert(dataArray).select(select),
    { operation: `insert multiple into ${table}` }
  );
};

/**
 * Update a record by ID
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @param {Object} data - Data to update
 * @param {string} select - Fields to return (default: '*')
 * @returns {Promise<Object>}
 */
export const updateRecord = async (table, id, data, select = '*') => {
  return dbQuery(
    () => supabase.from(table).update(data).eq('id', id).select(select).single(),
    { operation: `update ${table}` }
  );
};

/**
 * Update records with a filter
 * @param {string} table - Table name
 * @param {Object} filter - Filter conditions
 * @param {Object} data - Data to update
 * @param {string} select - Fields to return (default: '*')
 * @returns {Promise<Object>}
 */
export const updateWhere = async (table, filter, data, select = '*') => {
  return dbQuery(
    () => {
      let query = supabase.from(table).update(data);
      
      Object.entries(filter).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      
      return query.select(select);
    },
    { operation: `update ${table} where` }
  );
};

/**
 * Delete a record by ID
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @returns {Promise<Object>}
 */
export const deleteRecord = async (table, id) => {
  return dbQuery(
    () => supabase.from(table).delete().eq('id', id),
    { operation: `delete from ${table}` }
  );
};

/**
 * Archive a record (soft delete by setting status/is_active)
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @param {Object} archiveData - Data to set for archiving (default: { is_active: false })
 * @returns {Promise<Object>}
 */
export const archiveRecord = async (table, id, archiveData = { is_active: false }) => {
  return updateRecord(table, id, {
    ...archiveData,
    archived_at: new Date().toISOString()
  });
};

/**
 * Call a Supabase RPC function
 * @param {string} functionName - Name of the database function
 * @param {Object} params - Function parameters
 * @returns {Promise<Object>}
 */
export const callFunction = async (functionName, params = {}) => {
  return dbQuery(
    () => supabase.rpc(functionName, params),
    { operation: `call function ${functionName}` }
  );
};

/**
 * Count records in a table with optional filter
 * @param {string} table - Table name
 * @param {Object} filter - Filter conditions
 * @returns {Promise<Object>}
 */
export const countRecords = async (table, filter = {}) => {
  return dbQuery(
    () => {
      let query = supabase.from(table).select('*', { count: 'exact', head: true });
      
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          query = query.eq(key, value);
        }
      });
      
      return query;
    },
    { operation: `count ${table}` }
  );
};

/**
 * Check if a record exists
 * @param {string} table - Table name
 * @param {Object} filter - Filter conditions
 * @returns {Promise<boolean>}
 */
export const recordExists = async (table, filter) => {
  const result = await countRecords(table, filter);
  return result.success && result.data && result.data.count > 0;
};

/**
 * Batch operation helper
 * @param {Array<Function>} operations - Array of async operations
 * @returns {Promise<Array>} Results of all operations
 */
export const batchOperations = async (operations) => {
  try {
    const results = await Promise.allSettled(operations.map(op => op()));
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return {
          success: true,
          data: result.value,
          index
        };
      } else {
        return {
          success: false,
          error: result.reason?.message || 'Operation failed',
          index
        };
      }
    });
  } catch (error) {
    console.error('Batch operation error:', error);
    return {
      success: false,
      error: 'Batch operation failed',
      originalError: error
    };
  }
};

/**
 * Upload file to Supabase Storage
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path in bucket
 * @param {File} file - File to upload
 * @param {Object} options - Upload options
 * @returns {Promise<Object>}
 */
export const uploadFile = async (bucket, path, file, options = {}) => {
  const { upsert = false, contentType = null } = options;

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        upsert,
        contentType: contentType || file.type
      });

    if (error) {
      return {
        success: false,
        data: null,
        error: error.message,
        originalError: error
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return {
      success: true,
      data: {
        ...data,
        publicUrl: urlData.publicUrl
      },
      error: null
    };
  } catch (error) {
    console.error('File upload error:', error);
    return {
      success: false,
      data: null,
      error: 'File upload failed',
      originalError: error
    };
  }
};

/**
 * Delete file from Supabase Storage
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path in bucket
 * @returns {Promise<Object>}
 */
export const deleteFile = async (bucket, path) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    return validateSupabaseResponse({ data, error }, 'delete file');
  } catch (error) {
    console.error('File deletion error:', error);
    return {
      success: false,
      data: null,
      error: 'File deletion failed',
      originalError: error
    };
  }
};

/**
 * Get file public URL
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path in bucket
 * @returns {string} Public URL
 */
export const getFileUrl = (bucket, path) => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

export default {
  dbQuery,
  fetchById,
  fetchAll,
  insertRecord,
  insertMany,
  updateRecord,
  updateWhere,
  deleteRecord,
  archiveRecord,
  callFunction,
  countRecords,
  recordExists,
  batchOperations,
  uploadFile,
  deleteFile,
  getFileUrl
};
