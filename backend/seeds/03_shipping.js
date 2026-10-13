// Shipping options. Electric cars are delivered by transporter and priced
// differently from accessories, so the catalogue offers both tiers.
exports.seed = async function seed(knex) {
  const existing = await knex('shipping_methods').count('id as n').first();
  if (Number(existing.n) > 0) return; // idempotent

  await knex('shipping_methods').insert([
    {
      code: 'standard',
      name: 'Standard delivery',
      description: 'Tracked courier delivery for accessories and parts.',
      price_cents: 499,
      eta_days_min: 3,
      eta_days_max: 5,
      sort_order: 1,
    },
    {
      code: 'express',
      name: 'Express delivery',
      description: 'Next business day for accessories ordered before 14:00.',
      price_cents: 1299,
      eta_days_min: 1,
      eta_days_max: 2,
      sort_order: 2,
    },
    {
      code: 'vehicle_transport',
      name: 'Vehicle transport',
      description:
        'Enclosed transporter delivery to your address, including handover and registration paperwork.',
      price_cents: 49900,
      eta_days_min: 10,
      eta_days_max: 21,
      sort_order: 3,
    },
    {
      code: 'vehicle_pickup',
      name: 'Collect from showroom',
      description: 'Collect the vehicle yourself from our Tallinn showroom.',
      price_cents: 0,
      eta_days_min: 7,
      eta_days_max: 14,
      sort_order: 4,
    },
  ]);
};
