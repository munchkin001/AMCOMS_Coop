import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import Login from './components/Login'
import PortalSelection from './components/PortalSelection'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import DemoPages from './pages/DemoPages'
import StaffPortal from './pages/StaffPortal'
import MemberPortal from './pages/MemberPortal'
import FormSubmissionConfirmation from './components/FormSubmissionConfirmation'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/demo" element={<DemoPages />} />
          <Route path="/portal-selection" element={<PortalSelection />} />
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
      </Router>
    </AuthProvider>
  )
}

export default App
