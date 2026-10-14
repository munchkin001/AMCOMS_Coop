import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import Login from './components/Login'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import DemoPages from './pages/DemoPages'
import StaffPortal from './pages/StaffPortal'
import MemberPortal from './pages/MemberPortal'
import FormSubmissionConfirmation from './components/FormSubmissionConfirmation'
import OfflineStatus from "./components/common/OfflineStatus";
import OfflineSyncStatus from "./components/common/OfflineSyncStatus";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/demo" element={<DemoPages />} />
          <Route path="/portal-selection" element={<Navigate to="/" replace />} />
          <Route path="/login/staff" element={<Login />} />
          <Route path="/login/:portalType" element={<Login />} />
          <Route path="/member-signup" element={<Navigate to="/login/member" replace />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          
          {/* Staff Portal - All staff roles access this */}
          <Route 
            path="/staff/*" 
            element={
              <ProtectedRoute allowedRoles={['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory']}>
                <StaffPortal />
              </ProtectedRoute>
            } 
          />
          
          {/* Member Portal */}
          <Route 
            path="/member" 
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <MemberPortal />
              </ProtectedRoute>
            } 
          />
        </Routes>
        <FormSubmissionConfirmation />
        <OfflineStatus />
        <OfflineSyncStatus />
      </Router>
    </AuthProvider>
  )
}

export default App
