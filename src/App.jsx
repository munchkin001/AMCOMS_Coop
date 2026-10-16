import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import Login from './components/Login'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import DemoPages from './pages/DemoPages'
import MemberPortal from './pages/MemberPortal'
import FormSubmissionConfirmation from './components/FormSubmissionConfirmation'
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
          <Route path="/login/member" element={<Login portalType="member" />} />
          <Route path="/member-signup" element={<Navigate to="/login/member" replace />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          {/* Member Portal */}
          <Route 
            path="/member" 
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <MemberPortal />
              </ProtectedRoute>
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <FormSubmissionConfirmation />
        <OfflineSyncStatus />
      </Router>
    </AuthProvider>
  )
}

export default App
