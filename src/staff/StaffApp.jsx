
import React from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import { AuthProvider } from '../contexts/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import Login from '../components/Login'
import ForgotPassword from '../components/ForgotPassword'
import ResetPassword from '../components/ResetPassword'
import StaffPortal from './StaffPortal'
import FormSubmissionConfirmation from '../components/FormSubmissionConfirmation'
import OfflineSyncStatus from '../components/common/OfflineSyncStatus'

function StaffApp() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route
            path="/"
            element={<Navigate to="/login/staff" replace />}
          />

          <Route path="/login/staff" element={<Login portalType="staff" />} />

          <Route
            path="/forgot-password"
            element={<ForgotPassword />}
          />

          <Route
            path="/reset-password"
            element={<ResetPassword />}
          />

          <Route
            path="/staff/*"
            element={
              <ProtectedRoute
                allowedRoles={[
                  'chairman',
                  'manager',
                  'treasurer',
                  'bookkeeper',
                  'inventory',
                ]}
              >
                <StaffPortal />
              </ProtectedRoute>
            }
          />

          <Route
            path="*"
            element={<Navigate to="/login/staff" replace />}
          />
        </Routes>

        <FormSubmissionConfirmation />
        <OfflineSyncStatus />
      </Router>
    </AuthProvider>
  )
}

export default StaffApp
