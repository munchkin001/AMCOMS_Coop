export const APP_TOAST_EVENT = 'amcoms:toast';

const tableLabels = {
  announcements: 'Announcement',
  chart_of_accounts: 'Account',
  journal_entries: 'Journal entry',
  loan_applications: 'Loan application',
  loan_requests: 'Loan request',
  member_applications: 'Member application',
  members: 'Member',
  policies: 'Policy',
  product_categories: 'Product category',
  products: 'Product',
  purchase_items: 'Purchase item',
  purchases: 'Purchase',
  savings_accounts: 'Savings account',
  staff: 'Staff account',
  transactions: 'Transaction'
};

const rpcMessages = {
  bookkeeper_archive_member: 'Member archived successfully!',
  bookkeeper_create_member_with_details: 'Member added successfully!',
  bookkeeper_update_member_with_details: 'Member updated successfully!',
  bookkeeper_update_member_username: 'Member username updated successfully!',
  cancel_credit_sale: 'Credit sale cancelled successfully!',
  complete_own_staff_password_setup: 'Password setup completed successfully!',
  create_inventory_product: 'Product added successfully!',
  delete_cash_disbursement: 'Cash disbursement deleted successfully!',
  delete_cash_receipt: 'Cash receipt deleted successfully!',
  post_journal_entry: 'Journal entry posted successfully!',
  record_loan_disbursement: 'Loan disbursed successfully!',
  record_production_with_inventory: 'Production recorded successfully!',
  reverse_journal_entry: 'Journal entry reversed successfully!',
  review_loan_request: 'Loan request reviewed successfully!',
  review_member_application: 'Member application reviewed successfully!',
  submit_cash_disbursement: 'Cash disbursement recorded successfully!',
  submit_cash_receipt: 'Cash receipt recorded successfully!',
  submit_loan_request: 'Loan request submitted successfully!',
  submit_loan_request_for_member: 'Loan request submitted successfully!',
  submit_member_application: 'Application submitted successfully!',
  sync_offline_operation: 'Offline changes synced successfully!',
  void_cash_receipt: 'Cash receipt voided successfully!',
  value_existing_inventory_fifo: 'Opening inventory value saved successfully!'
};

const memberAccountMessages = {
  'delete-account': 'Member account deleted successfully!',
  'disable-account': 'Member account deactivated successfully!',
  invite: 'Member account invitation sent successfully!',
  reset: 'Password reset email sent successfully!',
  'reactivate-member': 'Member account reactivated successfully!'
};

const authMessages = {
  resetPasswordForEmail: 'Password reset email sent successfully!',
  signInAnonymously: 'Signed in successfully!',
  signInWithOAuth: 'Sign-in request started successfully!',
  signInWithOtp: 'Sign-in code sent successfully!',
  signInWithPassword: 'Signed in successfully!',
  signOut: 'Signed out successfully!',
  signUp: 'Account created successfully!',
  updateUser: 'Account updated successfully!',
  verifyOtp: 'Signed in successfully!'
};

const readableName = (value) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const successMessage = (table, action) => {
  const label = tableLabels[table] || readableName(table).replace(/s$/, '');
  const verb = { insert: 'added', update: 'updated', delete: 'deleted', upsert: 'saved' }[action] || 'saved';
  return `${label} ${verb} successfully!`;
};

export const emitActionNotification = (message, type = 'success') => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(APP_TOAST_EVENT, {
    detail: { message, type }
  }));
};

const wrapQuery = (query, notification, tableName = null) => new Proxy(query, {
  get(target, property) {
    const value = Reflect.get(target, property, target);
    if (property === 'then' && typeof value === 'function') {
      return (onFulfilled, onRejected) => value.call(target, (response) => {
        if (notification && !response?.error) emitActionNotification(notification);
        return onFulfilled ? onFulfilled(response) : response;
      }, onRejected);
    }

    if (typeof value !== 'function') return value;
    return (...args) => {
      const result = value.apply(target, args);
      const action = {
        insert: 'insert',
        update: 'update',
        delete: 'delete',
        upsert: 'upsert'
      }[property];

      let nextNotification = notification;
      if (action) nextNotification = successMessage(tableName, action);
      if (property === 'rpc') {
        const [functionName] = args;
        nextNotification = rpcMessages[functionName] || null;
      }

      if (result && typeof result === 'object' && typeof result.then === 'function') {
        return wrapQuery(result, nextNotification, tableName);
      }
      return result;
    };
  }
});

export const withActionNotifications = (client) => new Proxy(client, {
  get(target, property) {
    const value = Reflect.get(target, property, target);
    if (property === 'from' && typeof value === 'function') {
      return (table, ...args) => {
        const query = value.call(target, table, ...args);
        return wrapQuery(query, null, table);
      };
    }
    if (property === 'rpc' && typeof value === 'function') {
      return (...args) => wrapQuery(value.apply(target, args), rpcMessages[args[0]] || null);
    }
    if (property === 'functions' && value) {
      return new Proxy(value, {
        get(functionsTarget, functionProperty) {
          const functionValue = Reflect.get(functionsTarget, functionProperty, functionsTarget);
          if (functionProperty !== 'invoke' || typeof functionValue !== 'function') {
            return typeof functionValue === 'function' ? functionValue.bind(functionsTarget) : functionValue;
          }

          return async (...args) => {
            const response = await functionValue.apply(functionsTarget, args);
            if (response?.error) return response;

            const [functionName, options = {}] = args;
            const action = options.body?.action;
            if (functionName === 'member-account' && memberAccountMessages[action]) {
              emitActionNotification(memberAccountMessages[action]);
            } else if (functionName === 'member-signup') {
              emitActionNotification('Member account created successfully!');
            } else if (
              functionName === 'offline-sync'
              && response.data?.accepted === true
              && response.data?.stored === true
            ) {
              emitActionNotification('Offline change synced successfully!');
            } else if (functionName === 'semaphore-sms' && ['send', 'send-group'].includes(action)) {
              const { data } = response;
              if (data?.failed_count) {
                emitActionNotification(
                  `SMS sent: ${data.sent_count || 0} succeeded, ${data.failed_count} failed.`,
                  'warning'
                );
              } else if (data?.sent_count) {
                emitActionNotification(`${data.sent_count} SMS message(s) sent successfully!`);
              }
            }
            return response;
          };
        }
      });
    }
    if (property === 'auth' && value) {
      return new Proxy(value, {
        get(authTarget, authProperty) {
          const authValue = Reflect.get(authTarget, authProperty, authTarget);
          if (typeof authValue !== 'function') return authValue;
          if (!authMessages[authProperty]) return authValue.bind(authTarget);
          return async (...args) => {
            const response = await authValue.apply(authTarget, args);
            if (!response?.error && authMessages[authProperty]) {
              emitActionNotification(authMessages[authProperty]);
            }
            return response;
          };
        }
      });
    }
    return typeof value === 'function' ? value.bind(target) : value;
  }
});
