// NannyMaids — Stripe Checkout Session Creator
// REQUIRED ENV VARS in Netlify:
//   STRIPE_SECRET_KEY = sk_live_xxxx  (or sk_test_xxxx for testing)
//   SITE_URL = https://nannymaids-tampa.netlify.app

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const SITE_URL = (process.env.SITE_URL || 'https://nannymaids-tampa.netlify.app').replace(/\/$/, '');

// Server-side price table — amounts in CENTS
const PRICE_RULES = {
  'Basic Cleaning':        { base: 13000, perBed: 2500, perBath: 2500 },
  'Standard Cleaning':     { base: 17000, perBed: 1500, perBath: 2000 },
  'Deep Cleaning':         { base: 24000, perBed: 4000, perBath: 2500 },
  'Airbnb Turnover':       { base: 13500, perBed: 2000, perBath: 1500 },
  'Nanny / Childcare':     { hourly: 3000, perChild: 200 },
  'Companion Care':        { hourly: 3000 },
  'Pet Drop-In':           { flat: 2500 },
  'Dog Walking':           { flat: 2500 },
  'Overnight Pet Sitting': { flat: 7500 },
};

const ADDON_PRICES = { fridge: 3000, oven: 3000, laundry: 3000, hour: 3000 };
const CUSTOM_SERVICES = ['Move-In Cleaning', 'Move-Out Cleaning', 'Post-Construction Cleaning'];

function calculateAmount(service, options) {
  const rule = PRICE_RULES[service];
  if (!rule) return null;
  let total = 0;

  if (rule.flat) {
    total = rule.flat;
  } else if (rule.hourly) {
    const hours = Math.max(1, parseInt(options.hours) || 1);
    const children = Math.max(1, parseInt(options.children) || 1);
    const rate = rule.hourly + (rule.perChild && children > 1 ? rule.perChild * (children - 1) : 0);
    total = rate * hours;
  } else {
    const beds = Math.max(1, parseInt(options.beds) || 1);
    const baths = Math.max(1, parseFloat(options.baths) || 1);
    total = rule.base;
    if (beds > 1 && rule.perBed) total += rule.perBed * (beds - 1);
    if (baths > 1 && rule.perBath) total += Math.round(rule.perBath * (baths - 1));
  }

  if (options.addons && Array.isArray(options.addons)) {
    for (const addon of options.addons) {
      if (ADDON_PRICES[addon]) total += ADDON_PRICES[addon];
    }
  }

  return total;
}

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Check Stripe key is configured
  if (!STRIPE_SECRET) {
    console.error('STRIPE_SECRET_KEY is not set in Netlify environment variables');
    return {
      statusCode: 500, headers: HEADERS,
      body: JSON.stringify({ error: 'Payment system not configured. Please contact us at (813) 400-3679 to complete your booking.' })
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid request' }) }; }

  const { service, options = {}, customerEmail, customerName, bookingRef } = body;

  if (!service) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Service is required' }) };

  if (CUSTOM_SERVICES.includes(service)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'custom', message: 'This service requires a custom quote. We will contact you to arrange payment.' }) };
  }

  const amountCents = calculateAmount(service, options);
  if (!amountCents || amountCents < 50) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Could not calculate a valid price. Please go back and check your selections.' }) };
  }

  const description = [
    service,
    options.beds ? `${options.beds} bed` : null,
    options.baths ? `${options.baths} bath` : null,
    options.hours ? `${options.hours} hrs` : null,
    options.addons && options.addons.length ? `+ ${options.addons.join(', ')}` : null,
  ].filter(Boolean).join(' | ');

  const params = new URLSearchParams();
  params.append('payment_method_types[]', 'card');
  params.append('line_items[0][price_data][currency]', 'usd');
  params.append('line_items[0][price_data][unit_amount]', String(amountCents));
  params.append('line_items[0][price_data][product_data][name]', `NannyMaids - ${service}`);
  params.append('line_items[0][price_data][product_data][description]', description);
  params.append('line_items[0][quantity]', '1');
  params.append('mode', 'payment');
  params.append('success_url', `${SITE_URL}/?booking=success&ref=${encodeURIComponent(bookingRef || 'nm')}`);
  params.append('cancel_url', `${SITE_URL}/?booking=cancelled`);
  if (customerEmail) params.append('customer_email', customerEmail);
  params.append('metadata[service]', service);
  params.append('metadata[booking_ref]', bookingRef || '');
  params.append('metadata[customer_name]', customerName || '');

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(STRIPE_SECRET + ':').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('Stripe API error:', JSON.stringify(session));
      const msg = session.error?.message || 'Stripe returned an error';
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: msg }) };
    }

    if (!session.url) {
      console.error('No session URL returned:', JSON.stringify(session));
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'No checkout URL returned from Stripe' }) };
    }

    return {
      statusCode: 200, headers: HEADERS,
      body: JSON.stringify({ url: session.url, amount: amountCents, sessionId: session.id }),
    };

  } catch (err) {
    console.error('Network error reaching Stripe:', err.message);
    return {
      statusCode: 502, headers: HEADERS,
      body: JSON.stringify({ error: 'Could not reach Stripe. Please check your internet connection or call us at (813) 400-3679.' })
    };
  }
};
