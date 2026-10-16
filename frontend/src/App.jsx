import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { CartProvider } from './hooks/useCart';
import Header from './components/layout/Header';
import Home from './pages/Home';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import Account from './pages/Account';
import ProductList from './pages/ProductList';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import NotFound from './pages/NotFound';

// The admin console is lazy-loaded: it is used by three staff accounts and
// would otherwise sit in the bundle every customer downloads.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminProducts = lazy(() => import('./pages/admin/Products'));
const BulkImport = lazy(() => import('./pages/admin/BulkImport'));
const Categories = lazy(() => import('./pages/admin/Categories'));
const AdminOrders = lazy(() => import('./pages/admin/Orders').then((m) => ({ default: m.AdminOrders })));
const AdminOrderDetail = lazy(() => import('./pages/admin/Orders').then((m) => ({ default: m.AdminOrderDetail })));
const Moderation = lazy(() => import('./pages/admin/Moderation'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AuditLog = lazy(() => import('./pages/admin/AuditLog'));

function AdminFallback() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16" aria-busy="true">
      <p className="text-sm text-gray-500">Loading the admin console…</p>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <div className="flex min-h-screen flex-col">
          <Header />
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/account" element={<Account />} />
              <Route path="/products" element={<ProductList />} />
              <Route path="/products/:slug" element={<ProductDetail />} />
              <Route path="/search" element={<ProductList />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/orders/:reference" element={<OrderConfirmation />} />

              <Route
                path="/admin"
                element={
                  <Suspense fallback={<AdminFallback />}>
                    <AdminLayout />
                  </Suspense>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="products/import" element={<BulkImport />} />
                <Route path="categories" element={<Categories />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="orders/:reference" element={<AdminOrderDetail />} />
                <Route path="reviews" element={<Moderation />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="audit" element={<AuditLog />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
          <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-500">
            Voltmarket — course project. No real cars were sold in the making of this shop.
          </footer>
        </div>
      </CartProvider>
    </AuthProvider>
  );
}
