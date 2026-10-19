import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, X } from 'lucide-react';
import { useCart } from '../../hooks/useCart';

// The cart button in the header, with a dropdown preview of what is in it.
// Implemented as a disclosure button rather than a hover menu: hover menus
// are unusable on touch and unreachable by keyboard.
export default function CartPreview() {
  const { cart, removeItem } = useCart();
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const button = useRef(null);
  const location = useLocation();

  // Navigating away should not leave the panel hanging open.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(e) {
      if (wrapper.current && !wrapper.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus(); // focus must not be lost to a closed panel
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const items = cart.items || [];
  const preview = items.slice(0, 3);

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={
          cart.itemCount > 0
            ? `Cart, ${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}, ${cart.total.formatted}`
            : 'Cart, empty'
        }
        className="flex items-center gap-1 rounded-md px-2 py-2 text-sm font-medium text-gray-600 transition hover:text-brand-700 sm:px-3"
      >
        <span className="relative flex items-center gap-1">
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Cart</span>
          {cart.itemCount > 0 && (
            <span
              aria-hidden="true"
              className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-semibold text-white"
            >
              {cart.itemCount}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Shopping cart preview"
          className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Your cart{cart.itemCount > 0 && ` (${cart.itemCount})`}
            </h2>
            <button
              type="button"
              onClick={() => { setOpen(false); button.current?.focus(); }}
              className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Close cart preview</span>
            </button>
          </div>

          {items.length === 0 ? (
            <div className="py-6 text-center">
              <ShoppingCart className="mx-auto mb-2 h-8 w-8 text-gray-300" aria-hidden="true" />
              <p className="text-sm text-gray-600">Your cart is empty.</p>
              <Link
                to="/products"
                className="mt-3 inline-block text-sm font-medium text-brand-700 underline"
              >
                Browse the shop
              </Link>
            </div>
          ) : (
            <>
              <ul className="mb-3 space-y-3">
                {preview.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.imageAlt || item.name}
                        className="h-12 w-12 flex-none rounded-lg border border-gray-200 object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-12 flex-none items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-400"
                      >
                        {item.quantity}×
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/products/${item.slug}`}
                        className="block truncate text-sm font-medium text-gray-900 hover:text-brand-700"
                      >
                        {item.name}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {item.quantity} × {item.unitPrice.formatted}
                      </p>
                    </div>
                    <div className="flex flex-none flex-col items-end">
                      <span className="text-sm font-medium text-gray-900">
                        {item.lineTotal.formatted}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-xs text-gray-600 underline transition hover:text-red-600"
                      >
                        Remove
                        <span className="sr-only"> {item.name} from cart</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {items.length > preview.length && (
                <p className="mb-3 text-xs text-gray-500">
                  and {items.length - preview.length} more item
                  {items.length - preview.length === 1 ? '' : 's'}
                </p>
              )}

              <div className="mb-3 flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold text-gray-900">{cart.subtotal.formatted}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/cart"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  View cart
                </Link>
                <Link
                  to="/checkout"
                  className="rounded-lg bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  Checkout
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
