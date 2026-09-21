import { useEffect, useRef } from 'react';

// Renders the reCAPTCHA v2 checkbox. The site key comes from the backend's
// /auth/config endpoint at runtime. With Google's public TEST keys the widget
// shows "for testing purposes only" and always passes — swap in real keys via
// the RECAPTCHA_SITE_KEY / RECAPTCHA_SECRET env vars.
export default function Recaptcha({ siteKey, onToken }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey) return;

    function renderWidget() {
      if (widgetIdRef.current !== null || !containerRef.current) return;
      widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => onTokenRef.current(''),
      });
    }

    if (window.grecaptcha && window.grecaptcha.render) {
      renderWidget();
      return;
    }
    window.__onRecaptchaLoad = renderWidget;
    if (!document.getElementById('recaptcha-script')) {
      const script = document.createElement('script');
      script.id = 'recaptcha-script';
      script.src = 'https://www.google.com/recaptcha/api.js?onload=__onRecaptchaLoad&render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="my-4" aria-label="CAPTCHA verification" />;
}

export function resetRecaptcha() {
  if (window.grecaptcha && window.grecaptcha.reset) window.grecaptcha.reset();
}
