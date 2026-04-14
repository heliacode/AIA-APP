import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Upload from './pages/Upload';
import InventoryDetail from './pages/InventoryDetail';
import LocationNew from './pages/LocationNew';
import LocationDetail from './pages/LocationDetail';
import ContainerDetail from './pages/ContainerDetail';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import CookiePolicy from './pages/CookiePolicy';
import Support from './pages/Support';
import ProtectedRoute from './components/ProtectedRoute';
import CaptureFAB from './components/CaptureFAB';

function RouteToastCleanup() {
  const { pathname } = useLocation();
  useEffect(() => {
    toast.dismiss();
  }, [pathname]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <Toaster richColors position="top-right" />
      <BrowserRouter>
        <RouteToastCleanup />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/support" element={<Support />} />
          <Route path="/cookies" element={<CookiePolicy />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex min-h-screen flex-col bg-muted/30">
                  <Header />
                  <main className="flex-grow">
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/location/new" element={<LocationNew />} />
                      <Route path="/location/:id" element={<LocationDetail />} />
                      <Route path="/room/:id" element={<ContainerDetail containerType="room" />} />
                      <Route path="/safe/:id" element={<ContainerDetail containerType="safe" />} />
                      <Route path="/new" element={<Upload />} />
                      <Route path="/inventory/:id" element={<InventoryDetail />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </main>
                  <CaptureFAB />
                  <Footer />
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
