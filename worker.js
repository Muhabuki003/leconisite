const SQUARE_API_URL = 'https://connect.squareup.com/v2';

const PRODUCTS = [
  { id: 'heart-bean-necklace', name: 'Heart Bean Necklace', price_cents: 9900, category: 'Necklaces' },
  { id: 'love-bracelet', name: 'Love Bracelet', price_cents: 9900, category: 'Bracelets' },
  { id: 'gold-hoop-earrings', name: 'Gold Hoop Earrings', price_cents: 7900, category: 'Earrings' },
  { id: 'chain-bracelet-stack', name: 'Chain Bracelet Stack', price_cents: 8900, category: 'Bracelets' },
  { id: 'statement-ring', name: 'Statement Ring', price_cents: 6900, category: 'Rings' },
  { id: 'layered-gold-necklace', name: 'Layered Gold Necklace', price_cents: 12900, category: 'Necklaces' },
  { id: 'crystal-tennis-bracelet', name: 'Crystal Tennis Bracelet', price_cents: 14900, category: 'Bracelets' },
  { id: 'pearl-drop-earrings', name: 'Pearl Drop Earrings', price_cents: 8900, category: 'Earrings' },
  { id: 'signet-ring', name: 'Signet Ring', price_cents: 5900, category: 'Rings' },
  { id: 'sunburst-pearl', name: 'Sunburst Pearl', price_cents: 15900, category: 'Designs' },
  { id: 'art-deco-brooch', name: 'Art Deco Brooch', price_cents: 19900, category: 'Designs' },
  { id: 'charm-bracelet', name: 'Charm Bracelet', price_cents: 11900, category: 'Bracelets' },
  { id: 'pearl-blossom', name: 'Pearl Blossom', price_cents: 8900, category: 'Designs' },
  { id: 'golden-stack', name: 'Golden Stack', price_cents: 13900, category: 'Sets' },
  { id: 'floral-brooch', name: 'Floral Brooch', price_cents: 17900, category: 'Designs' },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function handleProducts() {
  return json(PRODUCTS);
}

async function handleCheckout(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { items } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: 'Cart is empty' }, 400);
  }

  const lineItems = items.map((item) => {
    const product = PRODUCTS.find((p) => p.id === item.id);
    if (!product) return null;
    return {
      name: product.name,
      quantity: String(Math.max(1, parseInt(item.quantity) || 1)),
      base_price_money: {
        amount: product.price_cents,
        currency: 'USD',
      },
    };
  }).filter(Boolean);

  if (lineItems.length === 0) {
    return json({ error: 'No valid products in cart' }, 400);
  }

  const squareRes = await fetch(`${SQUARE_API_URL}/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      'Square-Version': '2024-01-18',
      'Authorization': `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: lineItems,
      },
      checkout_options: {
        redirect_url: env.REDIRECT_URL || 'https://leconiusa.com',
        merchant_support_email: env.SUPPORT_EMAIL || 'hello@leconiusa.com',
      },
    }),
  });

  const squareData = await squareRes.json();

  if (!squareRes.ok) {
    console.error('Square API error:', JSON.stringify(squareData));
    return json({ error: 'Failed to create checkout session' }, 502);
  }

  return json({ url: squareData.payment_link.url });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/api/products' && request.method === 'GET') {
      return handleProducts();
    }

    if (url.pathname === '/api/checkout' && request.method === 'POST') {
      return handleCheckout(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};
