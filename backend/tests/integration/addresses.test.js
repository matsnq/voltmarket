// The address book behind the account page. Addresses hold PII (recipient,
// street, phone are encrypted at rest), so ownership is as important here as
// the CRUD itself.
const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();
const unique = Date.now();

const BASE = {
  recipient: 'Book Tester',
  street: 'Tartu mnt 5',
  city: 'Tallinn',
  postalCode: '10117',
  country: 'EE',
};

async function signUp(tag) {
  const res = await request(app).post('/api/v1/auth/register').send({
    email: `addr-${tag}-${unique}@itest.local`,
    password: 'Passw0rd1',
    name: 'Address Book Tester',
    captchaToken: 'ok',
  });
  return res.body.accessToken;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('address book CRUD', () => {
  let token;

  beforeAll(async () => {
    token = await signUp('crud');
  });

  test('a new account starts with no addresses', async () => {
    const res = await request(app).get('/api/v1/addresses').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.addresses).toEqual([]);
  });

  test('the first address saved becomes the default automatically', async () => {
    const res = await request(app)
      .post('/api/v1/addresses')
      .set(auth(token))
      .send({ ...BASE, label: 'Home' });

    expect(res.status).toBe(201);
    expect(res.body.address.isDefault).toBe(true);
    expect(res.body.address.label).toBe('Home');
    // Round-trips through AES-256-GCM, so a readable value proves decryption.
    expect(res.body.address.street).toBe(BASE.street);
  });

  test('a second address is not default unless asked', async () => {
    const res = await request(app)
      .post('/api/v1/addresses')
      .set(auth(token))
      .send({ ...BASE, street: 'Narva mnt 7', label: 'Office' });

    expect(res.status).toBe(201);
    expect(res.body.address.isDefault).toBe(false);
  });

  test('promoting one address demotes the other — exactly one default', async () => {
    const { body } = await request(app).get('/api/v1/addresses').set(auth(token));
    const office = body.addresses.find((a) => a.label === 'Office');

    await request(app)
      .patch(`/api/v1/addresses/${office.id}`)
      .set(auth(token))
      .send({ ...BASE, street: 'Narva mnt 7', label: 'Office', isDefault: true })
      .expect(200);

    const after = await request(app).get('/api/v1/addresses').set(auth(token));
    const defaults = after.body.addresses.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].label).toBe('Office');
    // The default sorts first, which is what the account page renders.
    expect(after.body.addresses[0].label).toBe('Office');
  });

  test('an edit changes the stored values', async () => {
    const { body } = await request(app).get('/api/v1/addresses').set(auth(token));
    const home = body.addresses.find((a) => a.label === 'Home');

    const res = await request(app)
      .patch(`/api/v1/addresses/${home.id}`)
      .set(auth(token))
      .send({ ...BASE, city: 'Tartu', postalCode: '51004', label: 'Home' });

    expect(res.status).toBe(200);
    expect(res.body.address.city).toBe('Tartu');
    expect(res.body.address.postalCode).toBe('51004');
  });

  test('deleting the default promotes another address', async () => {
    const before = await request(app).get('/api/v1/addresses').set(auth(token));
    const theDefault = before.body.addresses.find((a) => a.isDefault);

    await request(app)
      .delete(`/api/v1/addresses/${theDefault.id}`)
      .set(auth(token))
      .expect(200);

    const after = await request(app).get('/api/v1/addresses').set(auth(token));
    expect(after.body.addresses).toHaveLength(1);
    // Without the promotion the account would be left with no default at all.
    expect(after.body.addresses[0].isDefault).toBe(true);
  });
});

describe('address book authorization and validation', () => {
  test('addresses are private to their owner', async () => {
    const owner = await signUp('owner');
    const stranger = await signUp('stranger');

    const created = await request(app)
      .post('/api/v1/addresses')
      .set(auth(owner))
      .send(BASE);
    const id = created.body.address.id;

    // The stranger sees an empty book, not the owner's address.
    const list = await request(app).get('/api/v1/addresses').set(auth(stranger));
    expect(list.body.addresses).toEqual([]);

    // 404 rather than 403: existence itself is not disclosed.
    await request(app).patch(`/api/v1/addresses/${id}`).set(auth(stranger)).send(BASE).expect(404);
    await request(app).delete(`/api/v1/addresses/${id}`).set(auth(stranger)).expect(404);

    // The owner's address survived both attempts.
    const still = await request(app).get('/api/v1/addresses').set(auth(owner));
    expect(still.body.addresses).toHaveLength(1);
  });

  test('the address book requires a login', async () => {
    await request(app).get('/api/v1/addresses').expect(401);
    await request(app).post('/api/v1/addresses').send(BASE).expect(401);
  });

  test('a country we do not ship to is refused (semantic validation)', async () => {
    const token = await signUp('country');
    const res = await request(app)
      .post('/api/v1/addresses')
      .set(auth(token))
      .send({ ...BASE, country: 'US' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toMatch(/do not ship/i);
  });

  test('unknown fields are rejected rather than silently stored (whitelisting)', async () => {
    const token = await signUp('strict');
    const res = await request(app)
      .post('/api/v1/addresses')
      .set(auth(token))
      .send({ ...BASE, isAdmin: true });

    expect(res.status).toBe(400);
  });
});
