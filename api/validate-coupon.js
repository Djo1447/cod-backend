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

    const code      = (body.code || '').trim().toUpperCase();
    const cartPrice = parseInt(body.cart_price) || 0;

    if (!code) return res.status(400).json({ valid: false, error: 'No code' });

    console.log('Validating code:', code, '| store:', SHOPIFY_STORE, '| cart_price:', cartPrice);

    // Search all price rules and find matching discount code
    let foundRule = null;
    let page = 1;
    const limit = 250;

    while (true) {
      const rulesRes = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2025-01/price_rules.json?limit=${limit}`,
        { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' } }
      );

      console.log('Price rules status:', rulesRes.status);
      if (!rulesRes.ok) {
        const errText = await rulesRes.text();
        console.log('Price rules error:', errText);
        return res.status(200).json({ valid: false, error: 'Cannot fetch price rules' });
      }

      const { price_rules } = await rulesRes.json();
      console.log('Found', price_rules.length, 'price rules');

      for (const rule of price_rules) {
        // Get discount codes for this rule
        const codesRes = await fetch(
          `https://${SHOPIFY_STORE}/admin/api/2025-01/price_rules/${rule.id}/discount_codes.json`,
          { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' } }
        );
        if (!codesRes.ok) continue;

        const { discount_codes } = await codesRes.json();
        const match = discount_codes.find(dc => dc.code.toUpperCase() === code);

        if (match) {
          console.log('Found match! Rule:', rule.id, 'Code:', match.code, 'Usage:', match.usage_count);
          foundRule = { rule, discountCode: match };
          break;
        }
      }

      if (foundRule || price_rules.length < limit) break;
      page++;
    }

    if (!foundRule) {
      console.log('Code not found in any price rule');
      return res.status(200).json({ valid: false, error: 'Code not found' });
    }

    const { rule, discountCode } = foundRule;
    const now = new Date();

    // Validity checks
    if (rule.ends_at && new Date(rule.ends_at) < now)
      return res.status(200).json({ valid: false, error: 'Code expired' });
    if (rule.starts_at && new Date(rule.starts_at) > now)
      return res.status(200).json({ valid: false, error: 'Code not active yet' });
    if (rule.usage_limit !== null && discountCode.usage_count >= rule.usage_limit)
      return res.status(200).json({ valid: false, error: 'Usage limit reached' });

    console.log('Rule value_type:', rule.value_type, '| value:', rule.value);

    // Calculate discount amount in millimes
    const value = Math.abs(parseFloat(rule.value));
    let amount  = 0;

    if (rule.value_type === 'percentage') {
      amount = Math.round(cartPrice * value / 100);
      console.log('Percent:', value, '% | amount:', amount, 'millimes');
      return res.status(200).json({ valid: true, type: 'percent', value, amount });
    } else if (rule.value_type === 'fixed_amount') {
      amount = Math.round(value * 100);
      console.log('Fixed:', value, 'TND | amount:', amount, 'millimes');
      return res.status(200).json({ valid: true, type: 'fixed', amount });
    }

    return res.status(200).json({ valid: false, error: 'Unsupported type: ' + rule.value_type });

  } catch(e) {
    console.error('validate-coupon error:', e.message);
    return res.status(200).json({ valid: false, error: e.message });
  }
}
