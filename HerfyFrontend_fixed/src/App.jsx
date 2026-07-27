import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthInit from './components/layout/AuthInit';
import ProtectedRoute from './components/layout/ProtectedRoute';
import CustomerLayout from './components/layout/CustomerLayout';
import HandymanLayout from './components/layout/HandymanLayout';
import AdminLayout from './components/layout/AdminLayout';

import WelcomePage from './pages/auth/WelcomePage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';

import HomePage from './pages/customer/HomePage';
import MapPage from './pages/customer/MapPage';
import HandymanProfilePage from './pages/customer/HandymanProfilePage';
import CreateOrderPage from './pages/customer/CreateOrderPage';
import TrackingPage from './pages/customer/TrackingPage';
import ReviewPage from './pages/customer/ReviewPage';
import CustomerDashboard from './pages/customer/CustomerDashboard';
import CustomerProfilePage from './pages/customer/CustomerProfilePage';
import NotificationsPage from './pages/customer/NotificationsPage';

import HandymanDashboard from './pages/handyman/HandymanDashboard';
import HandymanOrdersPage from './pages/handyman/HandymanOrdersPage';
import HandymanOrderDetailsPage from './pages/handyman/HandymanOrderDetailsPage';
import HandymanSettingsPage from './pages/handyman/HandymanSettingsPage';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminVerificationsPage from './pages/admin/AdminVerificationsPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminWalletsPage from './pages/admin/AdminWalletsPage';
import AdminReferenceDataPage from './pages/admin/AdminReferenceDataPage';
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage';
import AdminAuditLogPage from './pages/admin/AdminAuditLogPage';

import ChatPage from './pages/chat/ChatPage';
import MyReportsPage from './pages/shared/MyReportsPage';

function App() {
  return (
    <BrowserRouter>
      <AuthInit>
        <Routes>
          {/* Public */}
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Customer */}
          <Route
            path="/customer"
            element={
              <ProtectedRoute allowedRoles={['customer']}>
                <CustomerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<HomePage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="handyman/:id" element={<HandymanProfilePage />} />
            <Route path="create-order/:handymanId" element={<CreateOrderPage />} />
            <Route path="tracking/:orderId" element={<TrackingPage />} />
            <Route path="review/:orderId" element={<ReviewPage />} />
            <Route path="dashboard" element={<CustomerDashboard />} />
            <Route path="profile" element={<CustomerProfilePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="reports" element={<MyReportsPage />} />
          </Route>

          {/* Handyman */}
          <Route
            path="/handyman"
            element={
              <ProtectedRoute allowedRoles={['handyman']}>
                <HandymanLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<HandymanDashboard />} />
            <Route path="orders" element={<HandymanOrdersPage />} />
            <Route path="orders/:id" element={<HandymanOrderDetailsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="reports" element={<MyReportsPage />} />
            <Route path="profile" element={<HandymanSettingsPage />} />
          </Route>

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="verifications" element={<AdminVerificationsPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="wallets" element={<AdminWalletsPage />} />
            <Route path="reference-data" element={<AdminReferenceDataPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="audit-log" element={<AdminAuditLogPage />} />
          </Route>

          {/* Chat (customer & handyman) */}
          <Route
            path="/chat/:orderId"
            element={
              <ProtectedRoute allowedRoles={['customer', 'handyman']}>
                <ChatPage />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthInit>
    </BrowserRouter>
  );
}

export default App;
