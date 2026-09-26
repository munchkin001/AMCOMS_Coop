import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import Login from './components/Login'
import StaffLogin from './components/StaffLogin'
import MemberLogin from './components/MemberLogin'
import MemberSignup from './components/MemberSignup'
import PortalSelection from './components/PortalSelection'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import DemoPages from './pages/DemoPages'
import ChairmanPortal from './pages/ChairmanPortal'
import ManagerPortal from './pages/ManagerPortal'
import TreasurerPortal from './pages/TreasurerPortal'
import BookkeeperPortal from './pages/BookkeeperPortal'
import InventoryPortal from './pages/InventoryPortal'
import MemberPortal from './pages/MemberPortal'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/demo" element={<DemoPages />} />
          <Route path="/portal-selection" element={<PortalSelection />} />

          {/* Separate Login Routes */}
          <Route path="/staff-login" element={<StaffLogin />} />
          <Route path="/member-login" element={<MemberLogin />} />
          <Route path="/member-signup" element={<MemberSignup />} />

          {/* Legacy login route (redirects to portal selection) */}
          <Route path="/login/:portalType" element={<Login />} />

          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected Portal Routes */}
          <Route
            path="/chairman-portal"
            element={
              <ProtectedRoute allowedRoles={['chairman']}>
                <ChairmanPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager-portal"
            element={
              <ProtectedRoute allowedRoles={['manager']}>
                <ManagerPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/treasurer-portal"
            element={
              <ProtectedRoute allowedRoles={['treasurer']}>
                <TreasurerPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookkeeper-portal"
            element={
              <ProtectedRoute allowedRoles={['bookkeeper']}>
                <BookkeeperPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory-portal"
            element={
              <ProtectedRoute allowedRoles={['inventory']}>
                <InventoryPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/member-portal"
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <MemberPortal />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
