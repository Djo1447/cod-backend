// /api/validate-coupon.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
  if (!SHOPIFY_TOKEN) return res.status(500).json({ valid: false, error: 'No SHOPIFY_TOKEN' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }

    const code       = (body.code || '').trim().toUpperCase();
    const cartPrice  = parseInt(body.cart_price) || 0; // bundle price in millimes

    if (!code) return res.status(400).json({ valid: false, error: 'No code' });

    // Step 1: lookup the discount code
    const lookupRes = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/discount_codes/lookup.json?code=${encodeURIComponent(code)}`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' } }
    );
    if (!lookupRes.ok) return res.status(200).json({ valid: false, error: 'Code not found' });

    const { discount_code } = await lookupRes.json();
    if (!discount_code) return res.status(200).json({ valid: false, error: 'Code not found' });

    // Step 2: get the price rule
    const ruleRes = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/price_rules/${discount_code.price_rule_id}.json`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' } }
    );
    if (!ruleRes.ok) return res.status(200).json({ valid: false, error: 'Rule not found' });

    const { price_rule: rule } = await ruleRes.json();
    const now = new Date();

    // Step 3: check validity
    if (rule.ends_at && new Date(rule.ends_at) < now)
      return res.status(200).json({ valid: false, error: 'Code expired' });
    if (rule.starts_at && new Date(rule.starts_at) > now)
      return res.status(200).json({ valid: false, error: 'Code not active yet' });
    if (rule.usage_limit !== null && discount_code.usage_count >= rule.usage_limit)
      return res.status(200).json({ valid: false, error: 'Usage limit reached' });

    // Step 4: calculate amount in millimes
    const value = Math.abs(parseFloat(rule.value));
    let amount = 0;

    if (rule.value_type === 'percentage') {
      amount = Math.round(cartPrice * value / 100);
      return res.status(200).json({ valid: true, type: 'percent', value, amount });
    } else if (rule.value_type === 'fixed_amount') {
      amount = Math.round(value * 1000); // TND has 3 decimal places
      return res.status(200).json({ valid: true, type: 'fixed', amount });
    }

    return res.status(200).json({ valid: false, error: 'Unsupported discount type' });

  } catch(e) {
    console.error('validate-coupon error:', e.message);
    return res.status(200).json({ valid: false, error: e.message });
  }
}
