import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package } from 'lucide-react';
import { api } from '../../lib/api';

// Type-ahead search backed by the catalog's pg_trgm suggestions, so a
// misspelling such as "tesle" still finds Tesla.
export default function QuickSearch() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  // Debounced: one request per pause in typing, not per keystroke.
  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      api(`/products/suggest?q=${encodeURIComponent(query.trim())}`)
        .then((d) => {
          setSuggestions(d.suggestions);
          setOpen(true);
          setActive(-1);
        })
        .catch(() => setSuggestions([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickAway(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  function go(slug) {
    setOpen(false);
    setQuery('');
    navigate(`/products/${slug}`);
  }

  function onKeyDown(e) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      go(suggestions[active].slug);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative hidden flex-1 md:block md:max-w-xs">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (!query.trim()) return;
          setOpen(false);
          navigate(`/products?q=${encodeURIComponent(query.trim())}`);
        }}
      >
        <label htmlFor="quick-search" className="sr-only">
          Search products
        </label>
        <Search
          className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-gray-400"
          aria-hidden="true"
        />
        <input
          id="quick-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length && setOpen(true)}
          placeholder="Search cars, chargers…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="quick-search-results"
          aria-autocomplete="list"
          className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </form>

      {open && suggestions.length > 0 && (
        <ul
          id="quick-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-10 z-30 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.slug} role="option" aria-selected={i === active}>
              <button
                type="button"
                onClick={() => go(s.slug)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  i === active ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
              >
                {s.image ? (
                  <img src={s.image} alt="" className="h-8 w-8 flex-none rounded object-cover" />
                ) : (
                  <Package className="h-8 w-8 flex-none p-1.5 text-gray-400" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate text-gray-900">{s.name}</span>
                <span className="flex-none text-xs font-medium text-gray-600">
                  {s.price.formatted}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
