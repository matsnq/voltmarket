const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'products');

const CATEGORY_TREE = [
  {
    name: 'Electric Cars',
    slug: 'electric-cars',
    description: 'New all-electric vehicles from leading brands',
    children: [
      ['Sedans', 'sedans'],
      ['SUVs & Crossovers', 'suvs-crossovers'],
      ['Hatchbacks & Compacts', 'hatchbacks-compacts'],
      ['Vans & Pickups', 'vans-pickups'],
    ],
  },
  {
    name: 'Charging & Accessories',
    slug: 'charging-accessories',
    description: 'Home chargers, cables, tires and EV gear',
    children: [
      ['Home Chargers', 'home-chargers'],
      ['Charging Cables', 'charging-cables'],
      ['Tires & Wheels', 'tires-wheels'],
      ['Car Care & Gear', 'car-care-gear'],
    ],
  },
];

const BRANDS = [
  ['Tesla', 'United States'], ['BYD', 'China'], ['Volkswagen', 'Germany'],
  ['Nissan', 'Japan'], ['Polestar', 'Sweden'], ['Hyundai', 'South Korea'],
  ['Kia', 'South Korea'], ['Renault', 'France'], ['Skoda', 'Czechia'],
  ['Audi', 'Germany'], ['Wallbox', 'Spain'], ['Easee', 'Norway'],
  ['Michelin', 'France'], ['Bosch', 'Germany'],
];

// [name, brand, category slug, price EUR, range km, battery kWh, power kW, weight kg, [L,W,H] mm]
const CARS = [
  ['Tesla Model 3 Standard Range', 'Tesla', 'sedans', 42990, 513, 57.5, 208, 1765, [4720, 1848, 1442]],
  ['Tesla Model 3 Long Range', 'Tesla', 'sedans', 49990, 629, 75, 366, 1828, [4720, 1848, 1442]],
  ['Tesla Model 3 Performance', 'Tesla', 'sedans', 57990, 547, 75, 460, 1847, [4720, 1848, 1442]],
  ['Hyundai Ioniq 6 Standard', 'Hyundai', 'sedans', 43900, 429, 53.3, 111, 1830, [4855, 1880, 1495]],
  ['Hyundai Ioniq 6 Long Range', 'Hyundai', 'sedans', 52900, 614, 77.4, 168, 1985, [4855, 1880, 1495]],
  ['BYD Seal Design', 'BYD', 'sedans', 44990, 460, 61.4, 150, 1922, [4800, 1875, 1460]],
  ['BYD Seal Excellence AWD', 'BYD', 'sedans', 50990, 520, 82.5, 390, 2055, [4800, 1875, 1460]],
  ['Polestar 2 Long Range', 'Polestar', 'sedans', 46800, 554, 82, 220, 2075, [4606, 1859, 1479]],
  ['Tesla Model Y RWD', 'Tesla', 'suvs-crossovers', 46990, 455, 60, 220, 1909, [4751, 1921, 1624]],
  ['Tesla Model Y Long Range AWD', 'Tesla', 'suvs-crossovers', 52490, 600, 79, 378, 1979, [4751, 1921, 1624]],
  ['Skoda Enyaq 85', 'Skoda', 'suvs-crossovers', 44900, 565, 82, 210, 2119, [4653, 1879, 1620]],
  ['Kia EV6 Long Range', 'Kia', 'suvs-crossovers', 46990, 528, 77.4, 168, 2015, [4695, 1890, 1550]],
  ['Volkswagen ID.4 Pro', 'Volkswagen', 'suvs-crossovers', 42900, 536, 77, 210, 2124, [4584, 1852, 1640]],
  ['Audi Q4 e-tron 45', 'Audi', 'suvs-crossovers', 52900, 534, 82, 210, 2135, [4588, 1865, 1632]],
  ['Nissan Ariya Evolve', 'Nissan', 'suvs-crossovers', 43900, 533, 87, 178, 2145, [4595, 1850, 1660]],
  ['BYD Atto 3 Comfort', 'BYD', 'suvs-crossovers', 37990, 420, 60.5, 150, 1750, [4455, 1875, 1615]],
  ['Hyundai Kona Electric 65', 'Hyundai', 'suvs-crossovers', 41990, 514, 65.4, 160, 1795, [4355, 1825, 1575]],
  ['Volkswagen ID.3 Pro', 'Volkswagen', 'hatchbacks-compacts', 37900, 426, 58, 150, 1812, [4261, 1809, 1568]],
  ['Renault Megane E-Tech EV60', 'Renault', 'hatchbacks-compacts', 38900, 450, 60, 160, 1711, [4200, 1860, 1505]],
  ['Renault 5 E-Tech Comfort Range', 'Renault', 'hatchbacks-compacts', 27900, 410, 52, 110, 1449, [3922, 1774, 1498]],
  ['Nissan Leaf e+', 'Nissan', 'hatchbacks-compacts', 32900, 385, 59, 160, 1709, [4490, 1788, 1530]],
  ['Kia Niro EV', 'Kia', 'hatchbacks-compacts', 41990, 460, 64.8, 150, 1739, [4420, 1825, 1570]],
  ['Volkswagen ID. Buzz Pro', 'Volkswagen', 'vans-pickups', 64900, 423, 77, 150, 2471, [4712, 1985, 1937]],
  ['Renault Kangoo E-Tech', 'Renault', 'vans-pickups', 38900, 285, 45, 90, 1838, [4486, 1860, 1864]],
];

// [name, brand, category slug, price EUR, weight kg, [L,W,H] mm, description]
const ACCESSORIES = [
  ['Wallbox Pulsar Max 22 kW', 'Wallbox', 'home-chargers', 749, 2.0, [212, 212, 113],
    'Compact 22 kW smart home charger with app control, dynamic power sharing and cable lock.'],
  ['Wallbox Pulsar Plus 11 kW', 'Wallbox', 'home-chargers', 649, 1.9, [212, 212, 113],
    'Bestselling 11 kW home wallbox with WiFi and Bluetooth scheduling for cheap night charging.'],
  ['Easee One Home Charger', 'Easee', 'home-chargers', 699, 1.5, [256, 193, 106],
    'Award-winning Norwegian 22 kW charging robot that load-balances across three phases automatically.'],
  ['Tesla Wall Connector Gen 3', 'Tesla', 'home-chargers', 550, 6.8, [345, 155, 110],
    'Tesla Wall Connector with up to 11 kW output, WiFi updates and power sharing for multiple cars.'],
  ['Bosch Power Charge 11 kW', 'Bosch', 'home-chargers', 599, 5.0, [300, 200, 120],
    'Reliable 11 kW home charging station with RFID access control and MID energy meter.'],
  ['Easee Type 2 Charging Cable 7 m', 'Easee', 'charging-cables', 189, 3.2, [300, 300, 120],
    'Flexible 7-meter Type 2 cable rated to 22 kW, with a soft-touch halogen-free jacket.'],
  ['Bosch Type 2 Cable 22 kW 5 m', 'Bosch', 'charging-cables', 249, 3.0, [280, 280, 110],
    'Heavy-duty 5-meter Type 2 to Type 2 cable for public AC chargers, rated IP55.'],
  ['Tesla Mobile Connector', 'Tesla', 'charging-cables', 275, 3.6, [370, 180, 140],
    'Portable charging kit with domestic socket adapter — up to 2.3 kW anywhere there is a wall plug.'],
  ['Wallbox Type 2 Cable 5 m', 'Wallbox', 'charging-cables', 159, 2.8, [280, 280, 110],
    'Everyday 5-meter Type 2 charging cable rated to 22 kW with carry bag.'],
  ['Michelin Pilot Sport EV 235/45 R19', 'Michelin', 'tires-wheels', 219, 10.5, [660, 235, 660],
    'Summer performance tire engineered for heavy, high-torque electric cars with low rolling resistance.'],
  ['Michelin CrossClimate 2 SUV 255/45 R20', 'Michelin', 'tires-wheels', 245, 12.1, [690, 255, 690],
    'All-season SUV tire with 3PMSF winter certification — one set for the whole year.'],
  ['Michelin e-Primacy 215/55 R17', 'Michelin', 'tires-wheels', 139, 8.7, [630, 215, 630],
    'Efficiency-first touring tire that adds real-world range to compact EVs.'],
  ['Bosch Aerotwin Wiper Blade Set', 'Bosch', 'car-care-gear', 39, 0.6, [650, 90, 40],
    'Frameless wiper blade pair with even pressure distribution for streak-free visibility.'],
  ['Bosch C40 Li Battery Maintainer', 'Bosch', 'car-care-gear', 89, 0.8, [197, 105, 50],
    'Trickle charger and maintainer for the 12 V auxiliary battery every EV still has.'],
  ['Tesla All-Weather Interior Mats Model 3', 'Tesla', 'car-care-gear', 225, 5.4, [800, 500, 120],
    'Deep-dish all-weather floor mat set, laser-measured for a perfect Model 3 fit.'],
];

const CATEGORY_LABEL = {
  sedans: 'sedan',
  'suvs-crossovers': 'SUV',
  'hatchbacks-compacts': 'hatchback',
  'vans-pickups': 'van',
};

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Deterministic pseudo-random from a string, so re-seeding gives stable data.
function hashInt(str, min, max) {
  let h = 7;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 100000;
  return min + (h % (max - min + 1));
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Card-sized variant: a third of the width and none of the text, which would
// be illegible at this size anyway. A separate asset rather than the same one
// scaled down, so a listing of 12 products does not fetch 12 full-size images.
function productThumbSvg(slug, isCar) {
  const hue = hashInt(slug, 0, 359);
  const bg = `hsl(${hue}, 60%, 92%)`;
  const accent = `hsl(${hue}, 70%, 45%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 140" role="img">
  <rect width="240" height="140" fill="${bg}"/>
  ${isCar
    ? `<rect x="40" y="62" width="160" height="34" rx="12" fill="${accent}"/><circle cx="78" cy="100" r="13" fill="#374151"/><circle cx="162" cy="100" r="13" fill="#374151"/>`
    : `<path d="M132 34 L96 78 h22 l-10 32 36-44 h-22 z" fill="${accent}"/>`}
</svg>
`;
}

function productSvg(name, brand, slug, isCar) {
  const hue = hashInt(slug, 0, 359);
  const bg = `hsl(${hue}, 60%, 92%)`;
  const fg = `hsl(${hue}, 55%, 38%)`;
  const accent = `hsl(${hue}, 45%, 78%)`;
  const art = isCar
    ? `<path d="M60 250 C80 200 120 185 200 180 L240 145 C260 125 300 115 350 115 L420 115 C470 115 510 130 530 150 L560 180 C620 188 660 205 680 250 L680 275 L60 275 Z" fill="${fg}"/>
       <rect x="250" y="135" width="150" height="45" rx="10" fill="${accent}"/>
       <circle cx="200" cy="275" r="38" fill="#1f2937"/><circle cx="200" cy="275" r="16" fill="#9ca3af"/>
       <circle cx="540" cy="275" r="38" fill="#1f2937"/><circle cx="540" cy="275" r="16" fill="#9ca3af"/>`
    : `<path d="M395 70 L305 215 L365 215 L340 330 L465 180 L395 180 L430 70 Z" fill="${fg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 420" role="img">
  <rect width="740" height="420" fill="${bg}"/>
  ${art}
  <text x="40" y="368" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#111827">${escapeXml(name)}</text>
  <text x="40" y="400" font-family="Arial, sans-serif" font-size="20" fill="#4b5563">${escapeXml(brand)}</text>
</svg>\n`;
}

function carDescription(name, brand, catSlug, range, battery, power) {
  const label = CATEGORY_LABEL[catSlug];
  const drivetrain = power >= 300 ? 'dual-motor all-wheel drive' : 'rear-wheel drive';
  return (
    `${name} is an all-electric ${label} from ${brand} with a WLTP range of ${range} km, ` +
    `a ${battery} kWh battery pack and ${power} kW of power through ${drivetrain}. ` +
    `Supports fast DC charging, includes advanced driver assistance and over-the-air updates. ` +
    `Delivered registered and road-ready with a full EU manufacturer warranty.`
  );
}

// If the DB is already seeded but image files are missing (e.g. a fresh
// uploads volume), regenerate them from the catalog rows.
async function regenerateMissingImages(knex) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const rows = await knex('product_images')
    .join('products', 'products.id', 'product_images.product_id')
    .join('brands', 'brands.id', 'products.brand_id')
    .select(
      'product_images.id',
      'product_images.file_path',
      'product_images.thumb_path',
      'products.name',
      'products.slug',
      'products.range_km',
      'brands.name as brand'
    );

  for (const row of rows) {
    const isCar = row.range_km !== null;

    const full = path.join(UPLOADS_DIR, path.basename(row.file_path));
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, productSvg(row.name, row.brand, row.slug, isCar));
    }

    // Also backfills databases seeded before thumbnails existed: the seed is
    // idempotent and will not revisit these products, so the variant has to
    // be filled in here or it never appears.
    const thumbName = `${row.slug}-thumb.svg`;
    const thumb = path.join(UPLOADS_DIR, thumbName);
    if (!fs.existsSync(thumb)) {
      fs.writeFileSync(thumb, productThumbSvg(row.slug, isCar));
    }
    if (!row.thumb_path) {
      await knex('product_images').where({ id: row.id }).update({
        thumb_path: `/uploads/products/${thumbName}`,
        width: 740,
        height: 420,
        thumb_width: 240,
        thumb_height: 140,
      });
    }
  }
}

exports.seed = async function seed(knex) {
  const count = await knex('categories').count('id as n').first();
  if (Number(count.n) > 0) {
    await regenerateMissingImages(knex);
    return; // idempotent
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const categoryIds = {}; // slug -> id
  for (const parent of CATEGORY_TREE) {
    const [p] = await knex('categories')
      .insert({ name: parent.name, slug: parent.slug, description: parent.description })
      .returning('id');
    categoryIds[parent.slug] = p.id;
    for (let i = 0; i < parent.children.length; i += 1) {
      const [name, slug] = parent.children[i];
      const [c] = await knex('categories')
        .insert({ name, slug, parent_id: p.id, sort_order: i })
        .returning('id');
      categoryIds[slug] = c.id;
    }
  }

  const brandIds = {}; // name -> id
  for (const [name, country] of BRANDS) {
    const [b] = await knex('brands')
      .insert({ name, slug: slugify(name), country })
      .returning('id');
    brandIds[name] = b.id;
  }

  async function insertProduct(row, isCar) {
    const slug = slugify(row.name);
    const [product] = await knex('products')
      .insert({
        name: row.name,
        slug,
        description: row.description,
        price_cents: row.priceEur * 100,
        stock_quantity: isCar ? hashInt(slug, 2, 18) : hashInt(slug, 15, 180),
        category_id: categoryIds[row.categorySlug],
        brand_id: brandIds[row.brand],
        weight_kg: row.weightKg,
        length_mm: row.dims[0],
        width_mm: row.dims[1],
        height_mm: row.dims[2],
        range_km: row.rangeKm || null,
        battery_kwh: row.batteryKwh || null,
        motor_power_kw: row.powerKw || null,
        attributes: JSON.stringify(
          isCar
            ? { seats: 5, drivetrain: row.powerKw >= 300 ? 'AWD' : 'RWD', body: CATEGORY_LABEL[row.categorySlug] }
            : {}
        ),
        // Placeholder ratings so rating sort is demonstrable; Project 3 seeds
        // real reviews and recomputes these from actual user feedback.
        rating_avg: (hashInt(slug, 36, 49) / 10).toFixed(2),
        rating_count: hashInt(`${slug}-count`, 4, 90),
      })
      .returning('id');

    const fileName = `${slug}.svg`;
    const thumbName = `${slug}-thumb.svg`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), productSvg(row.name, row.brand, slug, isCar));
    fs.writeFileSync(path.join(UPLOADS_DIR, thumbName), productThumbSvg(slug, isCar));
    await knex('product_images').insert({
      product_id: product.id,
      file_path: `/uploads/products/${fileName}`,
      thumb_path: `/uploads/products/${thumbName}`,
      width: 740,
      height: 420,
      thumb_width: 240,
      thumb_height: 140,
      alt_text: `${row.brand} ${row.name} product photo`,
      is_primary: true,
    });
  }

  for (const [name, brand, categorySlug, priceEur, rangeKm, batteryKwh, powerKw, weightKg, dims] of CARS) {
    await insertProduct(
      {
        name, brand, categorySlug, priceEur, rangeKm, batteryKwh, powerKw, weightKg, dims,
        description: carDescription(name, brand, categorySlug, rangeKm, batteryKwh, powerKw),
      },
      true
    );
  }

  for (const [name, brand, categorySlug, priceEur, weightKg, dims, description] of ACCESSORIES) {
    await insertProduct({ name, brand, categorySlug, priceEur, weightKg, dims, description }, false);
  }
};
