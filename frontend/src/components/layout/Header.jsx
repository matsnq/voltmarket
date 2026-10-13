import { Link, NavLink } from 'react-router-dom';
import { Zap, User, LogOut, ShoppingCart } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../hooks/useCart';

export default function Header() {
  const { user, logout } = useAuth();
  const { cart } = useCart();

  const navLinkClass = ({ isActive }) =>
    `rounded-md px-2 py-2 text-sm font-medium transition sm:px-3 ${
      isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:text-brand-700'
    }`;

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-brand-700">
          <Zap className="h-5 w-5" aria-hidden="true" />
          Voltmarket
        </Link>

        <nav aria-label="Main navigation" className="flex flex-none items-center gap-0.5 whitespace-nowrap sm:gap-1">
          <NavLink to="/" className={`${navLinkClass({ isActive: false })} hidden sm:block`} end>
            Home
          </NavLink>

          <NavLink to="/cart" className={navLinkClass}>
            <span className="relative flex items-center gap-1">
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Cart</span>
              {cart.itemCount > 0 && (
                <span
                  className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-semibold text-white"
                  aria-label={`${cart.itemCount} items in cart`}
                >
                  {cart.itemCount}
                </span>
              )}
            </span>
          </NavLink>

          {user ? (
            <>
              <NavLink to="/account" className={navLinkClass}>
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{user.name.split(' ')[0]}</span>
                </span>
              </NavLink>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition hover:text-red-600"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navLinkClass}>
                Log in
              </NavLink>
              <NavLink
                to="/register"
                className="ml-1 whitespace-nowrap rounded-md bg-brand-600 px-2.5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 sm:px-3"
              >
                Sign up
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
