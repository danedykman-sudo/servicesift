import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { ViewReport } from './pages/ViewReport';
import { DeltaReport } from './pages/DeltaReport';
import Maintenance from './pages/Maintenance';

const MAINTENANCE_MODE = false;

function AppContent() {
  const location = useLocation();
  const authPages = ['/login', '/signup', '/forgot-password', '/reset-password'];
  const pagesWithOwnHeader = ['/report/', '/delta/'];
  const showHeader = !authPages.includes(location.pathname) &&
    !pagesWithOwnHeader.some(page => location.pathname.startsWith(page));

  return (
    <>
      {showHeader && <Header />}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/report/:analysisId"
          element={
            <ProtectedRoute>
              <ViewReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/delta/:analysisId"
          element={
            <ProtectedRoute>
              <DeltaReport />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

function App() {
  if (MAINTENANCE_MODE) {
    return <Maintenance />;
  }

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
