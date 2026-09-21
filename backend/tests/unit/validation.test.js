const {
  registerSchema,
  loginSchema,
  resetPasswordSchema,
} = require('../../src/modules/auth/auth.validation');
const {
  listProductsSchema,
  suggestSchema,
} = require('../../src/modules/catalog/catalog.validation');

describe('auth input validation', () => {
  const valid = {
    email: 'User@Example.com ',
    password: 'Passw0rd1',
    name: 'Mari Maasikas',
    captchaToken: 'tok',
  };

  test('accepts valid registration and normalizes the email', () => {
    const result = registerSchema.parse(valid);
    expect(result.email).toBe('user@example.com');
  });

  test.each([
    ['bad email', { ...valid, email: 'not-an-email' }],
    ['short password', { ...valid, password: 'a1' }],
    ['password without digits', { ...valid, password: 'onlyletters' }],
    ['password without letters', { ...valid, password: '12345678' }],
    ['name with markup', { ...valid, name: '<script>alert(1)</script>' }],
    ['missing captcha', { ...valid, captchaToken: '' }],
  ])('rejects %s', (_label, input) => {
    expect(registerSchema.safeParse(input).success).toBe(false);
  });

  test('whitelisting: unknown fields are rejected', () => {
    const result = registerSchema.safeParse({ ...valid, role: 'admin' });
    expect(result.success).toBe(false);
  });

  test('login requires both fields', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  test('reset token must match the issued format', () => {
    expect(
      resetPasswordSchema.safeParse({ token: 'short', password: 'Passw0rd1' }).success
    ).toBe(false);
  });
});

describe('catalog input validation', () => {
  test('coerces numeric query params', () => {
    const parsed = listProductsSchema.parse({ page: '2', perPage: '24', minPrice: '1000' });
    expect(parsed.page).toBe(2);
    expect(parsed.minPrice).toBe(1000);
  });

  test('applies sane defaults', () => {
    const parsed = listProductsSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.perPage).toBe(12);
  });

  test('semantic check: minPrice must not exceed maxPrice', () => {
    expect(listProductsSchema.safeParse({ minPrice: '500', maxPrice: '100' }).success).toBe(false);
  });

  test('caps perPage to prevent resource exhaustion', () => {
    expect(listProductsSchema.safeParse({ perPage: '5000' }).success).toBe(false);
  });

  test('rejects unknown sort values (whitelist)', () => {
    expect(listProductsSchema.safeParse({ sort: 'DROP TABLE' }).success).toBe(false);
  });

  test('brand filter only allows slug characters', () => {
    expect(listProductsSchema.safeParse({ brand: "tesla'; --" }).success).toBe(false);
    expect(listProductsSchema.safeParse({ brand: 'tesla,byd' }).success).toBe(true);
  });

  test('suggest requires a non-empty query', () => {
    expect(suggestSchema.safeParse({ q: '  ' }).success).toBe(false);
  });
});
