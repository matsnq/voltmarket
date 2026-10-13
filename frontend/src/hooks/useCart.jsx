import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './useAuth';

const CartContext = createContext(null);

const EMPTY = {
  id: null,
  items: [],
  itemCount: 0,
  subtotal: { cents: 0, formatted: '€0.00' },
  shipping: { cents: 0, formatted: '€0.00' },
  total: { cents: 0, formatted: '€0.00' },
  related: [],
};

export function CartProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [cart, setCart] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api('/cart');
      setCart(data.cart);
      return data.cart;
    } catch {
      setCart(EMPTY);
      return EMPTY;
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload once auth has settled: logging in merges the guest cart server
  // side, so the first authenticated read returns the combined cart.
  useEffect(() => {
    if (!authLoading) refresh();
  }, [authLoading, user, refresh]);

  // Every mutation returns the recalculated cart, so totals stay in step with
  // the server rather than being re-derived in the browser.
  const mutate = useCallback(async (path, options) => {
    setError(null);
    try {
      const data = await api(path, options);
      setCart(data.cart);
      return { ok: true, cart: data.cart };
    } catch (err) {
      setError(err.message);
      return { ok: false, error: err.message };
    }
  }, []);

  const addItem = useCallback(
    (productId, quantity = 1) =>
      mutate('/cart/items', { method: 'POST', body: { productId, quantity } }),
    [mutate]
  );

  const updateItem = useCallback(
    (itemId, quantity) =>
      mutate(`/cart/items/${itemId}`, { method: 'PATCH', body: { quantity } }),
    [mutate]
  );

  const removeItem = useCallback(
    (itemId) => mutate(`/cart/items/${itemId}`, { method: 'DELETE' }),
    [mutate]
  );

  const clear = useCallback(() => mutate('/cart', { method: 'DELETE' }), [mutate]);

  return (
    <CartContext.Provider
      value={{ cart, loading, error, refresh, addItem, updateItem, removeItem, clear, setCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
