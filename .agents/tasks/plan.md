# Implementation Plan: Add Delete Account Action for Archived Members

## Build Result

✅ **Build Successful** - All changes compiled without errors. Build completed in 4.66s with 1971 modules transformed.

## Context

The task is to add a 'delete-account' action that allows bookkeepers to permanently delete archived member portal accounts from Supabase Auth. This is needed because currently there's no way to remove auth users when a member is permanently removed from the cooperative.

Based on codebase investigation:
- **Edge function location**: `supabase/functions/member-account/index.ts` contains the member account management actions
- **UI location**: `src/components/bookkeeper/MemberManagement.jsx` manages the member list and actions
- **Current actions**: invite, reset, resend-activation, disable-account, reactivate-member are already implemented
- **Loans table**: Has a `balance` column (DECIMAL 15,2) that tracks outstanding loan balance
- **Archive safety checks**: The `get_member_archive_review` function checks for outstanding loans, pending loans, and unresolved requests
- **Modal pattern**: Existing modals use consistent styling with alertdialog role and border/bg colors for warnings

## Implementation Plan

- [ ] 1. Add the delete-account action handler in the edge function BEFORE the active-members-only guard.
      Insert the new action block after the `disable-account` action (around line 162) and before the line that checks `if (member.membership_status !== 'active' || member.archived_at)` (around line 195).
      Safety checks: (1) Member must be archived (`membership_status === 'inactive' OR archived_at IS NOT NULL`), (2) No active loans with balance > 0 (`SELECT COUNT(*) FROM loans WHERE member_id = ... AND status IN ('approved', 'active') AND balance > 0`), (3) No pending transactions (this is already validated during archive, so not re-checked).
      Operations: (1) Delete the auth user via `admin.auth.admin.deleteUser(userId)`, (2) Update staff record to unlink auth: `UPDATE staff SET user_id = NULL WHERE member_id = ... AND role = 'member'` (preserve staff record for audit trail), (3) Log audit event: `recordAccountEvent(admin, actor.id, member.id, 'MEMBER_ACCOUNT_DELETED')`.
      Return JSON: `{ deleted: true, member_number: member.member_number }` with status 200.
      Files: `supabase/functions/member-account/index.ts`
      Verify: Deploy the edge function with `supabase functions deploy member-account` and test by calling it with a test archived member via the UI (step 6 will enable the UI).

- [ ] 2. Add Trash2 icon import to MemberManagement.jsx.
      Add `Trash2` to the existing lucide-react import statement on line 2: `import { Archive, Eye, KeyRound, Mail, Pencil, Plus, RotateCcw, Search, Trash2, UserRound, Users, X } from 'lucide-react';`
      Files: `src/components/bookkeeper/MemberManagement.jsx`
      Verify: Run `npm run dev` and check the browser console for any import errors.

- [ ] 3. Add state variables for delete account confirmation modal.
      Add two new state declarations after the existing state declarations (around line 23): `const [deleteConfirmMember, setDeleteConfirmMember] = useState(null);` and `const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);`
      Files: `src/components/bookkeeper/MemberManagement.jsx`
      Verify: Check that the component renders without errors by running `npm run dev` and navigating to the Members page.

- [ ] 4. Add handleDeleteAccount function to call the edge function.
      Insert the function after `handleReactivate` (around line 219):
      ```javascript
      const handleDeleteAccount = async () => {
        if (!canManageMembers || !deleteConfirmMember) return;
        setDeleteAccountLoading(true);
        setError('');
        setPortalNotice('');
        try {
          const { data, error: deleteError } = await supabase.functions.invoke('member-account', {
            body: { action: 'delete-account', member_id: deleteConfirmMember.id }
          });
          if (deleteError) throw deleteError;
          setPortalNotice(`Portal account for ${data?.member_number || deleteConfirmMember.member_number} was permanently deleted from Supabase Auth. The member record remains for audit purposes.`);
          setDeleteConfirmMember(null);
          await loadMembers();
        } catch (deleteError) {
          setError(await getAccountActionError(deleteError));
          await loadMembers();
        } finally {
          setDeleteAccountLoading(false);
        }
      };
      ```
      Files: `src/components/bookkeeper/MemberManagement.jsx`
      Verify: Save the file and ensure no syntax errors appear in the dev server console.

- [ ] 5. Add the delete account confirmation modal JSX.
      Insert the modal component after the reactivate modal (after line 607, before the closing div and the archived members help text). Match the existing modal style (alertdialog role, white rounded-xl bg, border-b on header, red accent for destructive action):
      ```jsx
      {deleteConfirmMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 id="delete-account-title" className="text-lg font-semibold text-gray-900">Delete Portal Account</h2>
              <p className="mt-1 text-sm text-gray-600">{fullName(deleteConfirmMember)} · {deleteConfirmMember.member_number}</p>
            </div>
            <div className="space-y-4 p-5">
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
              <div className="space-y-2 text-sm text-gray-700">
                <p className="font-semibold text-red-800">This action cannot be undone. Please confirm:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>This will permanently delete the member's portal account from Supabase Auth.</li>
                  <li>The member will no longer be able to sign in to the Member Portal.</li>
                  <li>The member's AMCOMS record will remain for audit purposes.</li>
                </ul>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => { setDeleteConfirmMember(null); setError(''); }} disabled={deleteAccountLoading} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 disabled:opacity-60">Cancel</button>
                <button type="button" onClick={handleDeleteAccount} disabled={deleteAccountLoading} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">
                  <Trash2 size={16} aria-hidden="true" />
                  {deleteAccountLoading ? 'Deleting…' : 'Delete Account'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      ```
      Files: `src/components/bookkeeper/MemberManagement.jsx`
      Verify: Navigate to the archived members view in the browser and check that no modal rendering errors appear in the console.

- [ ] 6. Add the Delete Account button to archived member row actions.
      In the table body, find the row actions for archived members (around line 584, the section that shows View and Reactivate buttons when `view === 'archived' && canManageMembers`). Add the Delete button AFTER the Reactivate button:
      ```jsx
      {view === 'archived' && canManageMembers && (
        <>
          <button type="button" onClick={() => { setSelectedMember(member); setError(''); setModal('reactivate'); }} aria-label={`Reactivate ${fullName(member)}`} title="Reactivate member" className="rounded-md p-2 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700"><RotateCcw size={17} /></button>
          {member.portal_account?.has_account && member.portal_account?.user_id && (
            <button type="button" onClick={() => { setDeleteConfirmMember(member); setError(''); }} aria-label={`Delete portal account for ${fullName(member)}`} title="Delete portal account" className="rounded-md p-2 text-gray-600 hover:bg-red-50 hover:text-red-700"><Trash2 size={17} /></button>
          )}
        </>
      )}
      ```
      The button only appears when: (1) member is archived, (2) user has bookkeeper permissions, (3) member has a portal account (`portal_account?.has_account === true`), (4) member has a linked auth user (`portal_account?.user_id` is truthy).
      Files: `src/components/bookkeeper/MemberManagement.jsx`
      Verify: In the browser, navigate to the archived members view and confirm the Delete button appears only for archived members with portal accounts. Click the button to verify the confirmation modal opens.

- [ ] 7. Test the complete delete flow end-to-end.
      Test steps: (1) Create a test member with portal account, (2) Archive the member via the Archive action, (3) Navigate to Archived Members view, (4) Verify Delete Account button is visible, (5) Click Delete Account and verify the confirmation modal shows the three warnings, (6) Click Delete Account in the modal, (7) Verify success message appears, (8) Verify the Delete button disappears (portal_account status should update to show no account), (9) Attempt to sign in with the deleted account and verify sign-in fails.
      Safety validation: (1) Attempt to delete an archived member with an active loan (manually create one via SQL if needed) and verify the edge function returns an error about outstanding loans, (2) Verify non-archived members do not show the Delete button.
      Files: Manual testing via browser
      Verify: All test cases pass. Document any edge cases or issues found.

## Notes

- The `balance` column in the loans table is used for the outstanding loan check.
- The existing `bookkeeper_member_account_status` RPC populates the `portal_account` object with `has_account`, `user_id`, and `is_active` fields.
- The delete action preserves the staff record by setting `user_id = NULL` rather than deleting the staff row, maintaining audit trail.
- The edge function's `recordAccountEvent` logs to the `audit_logs` table with action 'MEMBER_ACCOUNT_DELETED'.
- Error handling uses the existing `getAccountActionError` helper which extracts error messages from edge function responses.
- The modal uses red accent colors (`bg-red-700`, `hover:bg-red-800`, `text-red-800`) to signal the destructive nature of the action.
