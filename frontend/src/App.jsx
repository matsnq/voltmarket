import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { CartProvider } from './hooks/useCart';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
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
import Contact from './pages/Contact';
import About from './pages/About';
import Faq from './pages/Faq';
import Terms from './pages/Terms';
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
const Messages = lazy(() => import('./pages/admin/Messages'));
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
          {/* WCAG 2.4.1: let keyboard and screen-reader users jump past the
              header and its navigation, which repeat on every page. Visible
              only once focused. */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          >
            Skip to main content
          </a>
          <Header />
          {/* The skip link's target. tabIndex -1 makes it focusable by the
              jump without putting it in the tab order. Every page renders its
              own <main> inside here. */}
          <div id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
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
              <Route path="/contact" element={<Contact />} />
              <Route path="/about" element={<About />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/terms" element={<Terms />} />

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
                <Route path="messages" element={<Messages />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="audit" element={<AuditLog />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
          <Footer />
        </div>
      </CartProvider>
    </AuthProvider>
  );
}
