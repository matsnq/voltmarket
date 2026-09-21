// Client-side validation. Mirrors the server's zod rules (auth.validation.js)
// for instant feedback — the server remains the security boundary; this layer
// is purely UX.

export function validateEmail(value) {
  if (!value || !value.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())) {
    return 'Please enter a valid email address';
  }
  if (value.length > 255) return 'Email is too long';
  return null;
}

export function validatePassword(value) {
  if (!value) return 'Password is required';
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (value.length > 72) return 'Password must be at most 72 characters';
  if (!/[a-zA-Z]/.test(value)) return 'Password must contain a letter';
  if (!/[0-9]/.test(value)) return 'Password must contain a number';
  return null;
}

export function validateName(value) {
  if (!value || value.trim().length < 2) return 'Name must be at least 2 characters';
  if (value.length > 120) return 'Name is too long';
  if (!/^[\p{L}\p{N} .,'-]+$/u.test(value.trim())) return 'Name contains unsupported characters';
  return null;
}

export function validateConfirm(password, confirm) {
  if (password !== confirm) return 'Passwords do not match';
  return null;
}

export function validateOtp(value) {
  if (!value || !/^([0-9]{6}|[a-f0-9]{10})$/i.test(value.trim())) {
    return 'Enter the 6-digit code or a recovery code';
  }
  return null;
}

// Map the API's { field, message } validation details onto a form errors object.
export function serverErrorsToFields(apiError) {
  const errors = {};
  for (const detail of apiError.details || []) {
    if (detail.field && !errors[detail.field]) errors[detail.field] = detail.message;
  }
  return errors;
}
