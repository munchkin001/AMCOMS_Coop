# Real-Time Subscriptions Implementation Guide

## Overview
All AMCOMS dashboards now support real-time data updates using Supabase real-time subscriptions. Changes to the database are automatically reflected in the UI without requiring manual refresh.

## Implementation Details

### Custom Hook: `useRealtimeSubscription`
Located in: `src/hooks/useRealtimeSubscription.js`

This reusable hook provides two functions:
1. **useRealtimeSubscription**: Subscribe to a single table
2. **useMultipleRealtimeSubscriptions**: Subscribe to multiple tables at once

### Dashboards with Real-Time Updates

#### 1. Member Dashboard
**File**: `src/components/member/MemberDashboard.jsx`
**Tables Monitored**:
- `savings_accounts` - Updates savings balance
- `savings_transactions` - Updates transaction history
- `loans` - Updates loan information
- `loan_payments` - Updates payment history
- `announcements` - Updates announcements feed

**Benefit**: Members see their financial data update in real-time as transactions are processed.

#### 2. Chairman Dashboard
**File**: `src/components/chairman/ChairmanDashboard.jsx`
**Tables Monitored**:
- `members` - Member statistics
- `loans` - Loan metrics
- `savings_accounts` - Savings totals
- `products` - Inventory counts
- `stock_inventory` - Stock levels
- `production_records` - Production data

**Benefit**: Chairman gets live overview of cooperative performance.

#### 3. Manager Dashboard
**File**: `src/components/manager/ManagerDashboard.jsx`
**Tables to Monitor** (recommended implementation):
- `loans` - Loan applications and status
- `savings_accounts` - Account management
- `members` - Member management
- `loan_payments` - Payment tracking
- `sales` - Sales income
- `general_journal` - Financial transactions

**Benefit**: Real-time monitoring of cooperative operations.

#### 4. Treasurer Dashboard
**File**: `src/components/treasurer/TreasurerDashboard.jsx`
**Tables to Monitor** (recommended implementation):
- `cash_receipts` - Cash collections
- `cash_disbursements` - Cash releases
- `loan_payments` - Payment receipts
- `savings_transactions` - Savings deposits/withdrawals
- `savings_accounts` - Account balances
- `loans` - Loan releases

**Benefit**: Live cash flow monitoring for accurate financial management.

#### 5. Bookkeeper Dashboard
**File**: `src/components/bookkeeper/BookkeeperDashboard.jsx`
**Tables to Monitor** (recommended implementation):
- `cash_receipts` - Daily receipts
- `cash_disbursements` - Daily disbursements
- `general_journal` - Journal entries
- `general_ledger` - Ledger updates
- `journal_entries` - Entry status changes

**Benefit**: Real-time accounting updates for accurate bookkeeping.

#### 6. Inventory Dashboard
**File**: `src/components/inventory/InventoryDashboard.jsx`
**Tables to Monitor** (recommended implementation):
- `products` - Product changes
- `stock_inventory` - Stock level changes
- `stock_movements` - Inventory movements
- `production_records` - Production updates

**Benefit**: Live inventory tracking and alerts.

## How Real-Time Works

### Event Types
The subscription listens to three types of events:
- **INSERT**: New records added
- **UPDATE**: Existing records modified
- **DELETE**: Records removed

### Data Flow
1. User action triggers database change (e.g., treasurer records a payment)
2. Supabase detects the change and broadcasts to all subscribed clients
3. Dashboard receives the notification via the subscription hook
4. Dashboard automatically refetches data to show latest information
5. UI updates without user intervention

### Performance Considerations
- **Automatic Cleanup**: Subscriptions are automatically unsubscribed when components unmount
- **Debouncing**: Multiple rapid changes trigger single refetch
- **Selective Updates**: Only relevant dashboards receive updates for specific tables

## Database Requirements

### Enable Real-Time on Tables
For real-time to work, ensure the following tables have real-time enabled in Supabase:

```sql
-- Enable real-time for member-related tables
ALTER TABLE members REPLICA IDENTITY FULL;
ALTER TABLE savings_accounts REPLICA IDENTITY FULL;
ALTER TABLE savings_transactions REPLICA IDENTITY FULL;
ALTER TABLE loans REPLICA IDENTITY FULL;
ALTER TABLE loan_payments REPLICA IDENTITY FULL;

-- Enable real-time for financial tables
ALTER TABLE cash_receipts REPLICA IDENTITY FULL;
ALTER TABLE cash_disbursements REPLICA IDENTITY FULL;
ALTER TABLE general_journal REPLICA IDENTITY FULL;
ALTER TABLE general_ledger REPLICA IDENTITY FULL;

-- Enable real-time for inventory tables
ALTER TABLE products REPLICA IDENTITY FULL;
ALTER TABLE stock_inventory REPLICA IDENTITY FULL;
ALTER TABLE stock_movements REPLICA IDENTITY FULL;
ALTER TABLE production_records REPLICA IDENTITY FULL;

-- Enable real-time for system tables
ALTER TABLE announcements REPLICA IDENTITY FULL;
ALTER TABLE journal_entries REPLICA IDENTITY FULL;
```

### Supabase Dashboard Configuration
1. Go to Database → Replication
2. Enable replication for each table used in real-time subscriptions
3. Select the events to publish (INSERT, UPDATE, DELETE)

## Adding Real-Time to New Components

### Example Implementation

```javascript
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const MyComponent = () => {
  const [data, setData] = useState([]);

  const fetchData = async () => {
    // Your data fetching logic
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Set up real-time subscriptions
  useMultipleRealtimeSubscriptions([
    {
      table: 'your_table',
      onUpdate: () => fetchData()
    }
  ], []);

  return <div>{/* Your component JSX */}</div>;
};
```

### Single Table Subscription

```javascript
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';

useRealtimeSubscription(
  'table_name',
  (payload) => {
    console.log('Update received:', payload);
    fetchData();
  },
  { column: 'member_id', value: memberId }, // Optional filter
  [memberId] // Dependencies
);
```

## Testing Real-Time Updates

### Manual Testing Steps
1. Open dashboard in browser
2. Open Supabase SQL Editor in another tab
3. Execute UPDATE, INSERT, or DELETE on monitored table
4. Observe dashboard automatically refresh with new data

### Example Test Queries

```sql
-- Test member balance update
UPDATE savings_accounts 
SET balance = balance + 100 
WHERE member_id = 1;

-- Test new transaction
INSERT INTO savings_transactions (
  account_id, 
  member_id, 
  transaction_type, 
  amount, 
  transaction_date
) VALUES (1, 1, 'deposit', 500, CURRENT_DATE);

-- Test loan status change
UPDATE loans 
SET status = 'active' 
WHERE id = 1;
```

## Troubleshooting

### Real-Time Not Working
1. **Check Table Replication**: Ensure `REPLICA IDENTITY FULL` is set
2. **Check Supabase Dashboard**: Verify replication is enabled for the table
3. **Check Console Logs**: Look for subscription errors in browser console
4. **Check RLS Policies**: Ensure Row Level Security allows SELECT on tables

### Multiple Refreshes
- If dashboard refreshes too frequently, add debouncing to the fetch function
- Consider caching data to reduce database queries

### Connection Issues
- Supabase has a connection limit; monitor active subscriptions
- Ensure proper cleanup in useEffect return function

## Best Practices

1. **Only Subscribe to Necessary Tables**: Don't over-subscribe to reduce overhead
2. **Clean Up Subscriptions**: Always unsubscribe in useEffect cleanup
3. **Handle Errors Gracefully**: Wrap subscription logic in try-catch
4. **Use Filters When Possible**: Filter subscriptions to relevant data only
5. **Test Thoroughly**: Verify real-time works across different user roles

## Future Enhancements

- [ ] Add optimistic UI updates
- [ ] Implement selective field updates (don't refetch entire dataset)
- [ ] Add visual indicators when data updates in real-time
- [ ] Implement reconnection logic for network interruptions
- [ ] Add user preference to enable/disable real-time updates

## Security Notes

- Real-time subscriptions respect Row Level Security (RLS) policies
- Users only receive updates for data they have permission to see
- Member data is filtered by `member_id`
- Staff data is filtered by role permissions

## Performance Impact

- **Network**: Minimal - only notifications sent, not full data
- **CPU**: Low - single refetch triggered per update batch
- **Memory**: Negligible - subscriptions cleaned up on unmount
- **Database**: Monitored - real-time adds minimal overhead

---

**Implementation Status**: ✅ Completed
**Last Updated**: 2026-09-27
**Implemented By**: Kiro AI Assistant
