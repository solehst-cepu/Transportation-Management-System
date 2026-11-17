import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ToastProvider } from './components/ui/toast.tsx';
import { Layout } from './components/Layout.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { InternalBookingFormPage } from './pages/InternalBookingFormPage.tsx';
import { ExternalBookingFormPage } from './pages/ExternalBookingFormPage.tsx';
import { BookingsListPage } from './pages/BookingsListPage.tsx';
import { BookingCalendarPage } from './pages/BookingCalendarPage.tsx';
import { FleetDashboardPage } from './pages/FleetDashboardPage.tsx';
import { VehiclesPage } from './pages/VehiclesPage.tsx';
import { VehicleDetailPage } from './pages/VehicleDetailPage.tsx';
import { InspectionsPage } from './pages/InspectionsPage.tsx';
import { RepairsPage } from './pages/RepairsPage.tsx';
import { MaintenancePage } from './pages/MaintenancePage.tsx';
import { ExpensesPage, VehicleHistoryPage } from './pages/ExpensesAndHistoryPages.tsx';
import {
  AdminUsersPage,
  DepartmentsPage,
  DriversPage,
  VehicleTypesPage,
  VendorsPage,
} from './pages/MasterDataPages.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { NotificationsPage, ProfilePage, SettingsPage } from './pages/UtilityPages.tsx';
import { UserRole } from '../shared/types.ts';

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Memuat sesi LVBMS...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Shared Authenticated Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookings/internal"
        element={
          <ProtectedRoute>
            <InternalBookingFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookings/external"
        element={
          <ProtectedRoute>
            <ExternalBookingFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookings/my"
        element={
          <ProtectedRoute>
            <BookingsListPage mode="my" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookings/history"
        element={
          <ProtectedRoute>
            <BookingsListPage mode="history" />
          </ProtectedRoute>
        }
      />

      {/* Admin / GA Only Booking Routes */}
      <Route
        path="/bookings/approval"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <BookingsListPage mode="approval" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookings"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <BookingsListPage mode="all" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookings/calendar"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <BookingCalendarPage view="vehicles" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookings/drivers"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <BookingCalendarPage view="drivers" />
          </ProtectedRoute>
        }
      />

      {/* Admin / GA Only Transportation Management System Routes */}
      <Route
        path="/transportation"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <FleetDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transportation/vehicles"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <VehiclesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transportation/vehicles/:id"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <VehicleDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transportation/inspections"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <InspectionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transportation/repairs"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <RepairsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transportation/maintenance"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <MaintenancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transportation/history"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <VehicleHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transportation/costs"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <ExpensesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transportation/reports"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />

      {/* Master Data (Admin Only) */}
      <Route
        path="/master/departments"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <DepartmentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/master/drivers"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <DriversPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/master/vendors"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <VendorsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/master/vehicle-types"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <VehicleTypesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/master/admins"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />

      {/* Reports & Settings (Admin Only) */}
      <Route
        path="/reports"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
