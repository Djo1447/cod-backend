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

    // Step 1: lookup discount code
    const lookupRes = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/discount_codes/lookup.json?code=${encodeURIComponent(code)}`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' } }
    );

    console.log('Shopify lookup status:', lookupRes.status);
    const responseText = await lookupRes.text();
    console.log('Shopify lookup response:', responseText);

    if (!lookupRes.ok) return res.status(200).json({ valid: false, error: 'Code not found' });

    let discountData;
    try { discountData = JSON.parse(responseText); } catch(e) { return res.status(200).json({ valid: false, error: 'Parse error' }); }

    const discount_code = discountData.discount_code;
    if (!discount_code) return res.status(200).json({ valid: false, error: 'Code not found' });

    console.log('Found discount_code:', JSON.stringify(discount_code));

    // Step 2: get price rule
    const ruleRes = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/price_rules/${discount_code.price_rule_id}.json`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' } }
    );

    console.log('Price rule status:', ruleRes.status);
    const ruleText = await ruleRes.text();
    console.log('Price rule response:', ruleText);

    if (!ruleRes.ok) return res.status(200).json({ valid: false, error: 'Rule not found' });

    let ruleData;
    try { ruleData = JSON.parse(ruleText); } catch(e) { return res.status(200).json({ valid: false, error: 'Rule parse error' }); }

    const rule = ruleData.price_rule;
    const now  = new Date();

    // Step 3: validity checks
    if (rule.ends_at && new Date(rule.ends_at) < now)
      return res.status(200).json({ valid: false, error: 'Code expired' });
    if (rule.starts_at && new Date(rule.starts_at) > now)
      return res.status(200).json({ valid: false, error: 'Code not active yet' });
    if (rule.usage_limit !== null && discount_code.usage_count >= rule.usage_limit)
      return res.status(200).json({ valid: false, error: 'Usage limit reached' });

    console.log('Rule value_type:', rule.value_type, '| value:', rule.value);

    // Step 4: calculate amount in millimes
    const value = Math.abs(parseFloat(rule.value));
    let amount  = 0;

    if (rule.value_type === 'percentage') {
      amount = Math.round(cartPrice * value / 100);
      console.log('Percent discount:', value, '% | amount:', amount, 'millimes');
      return res.status(200).json({ valid: true, type: 'percent', value, amount });
    } else if (rule.value_type === 'fixed_amount') {
      amount = Math.round(value * 1000);
      console.log('Fixed discount:', value, 'TND | amount:', amount, 'millimes');
      return res.status(200).json({ valid: true, type: 'fixed', amount });
    }

    return res.status(200).json({ valid: false, error: 'Unsupported discount type: ' + rule.value_type });

  } catch(e) {
    console.error('validate-coupon error:', e.message);
    return res.status(200).json({ valid: false, error: e.message });
  }
}
