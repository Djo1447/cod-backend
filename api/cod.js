export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHOPIFY_STORE  = process.env.SHOPIFY_STORE;
  const SHOPIFY_KEY    = process.env.SHOPIFY_API_KEY;
  const SHOPIFY_SECRET = process.env.SHOPIFY_API_SECRET;
  const SHOPIFY_TOKEN  = process.env.SHOPIFY_TOKEN;

  if (req.method === 'GET') {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'No code' });
    try {
      const r = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: SHOPIFY_KEY, client_secret: SHOPIFY_SECRET, code })
      });
      const d = await r.json();
      return res.status(200).send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Success!</h2><p>Token:</p><code style="background:#f0f0f0;padding:10px;display:block;margin:20px auto;word-break:break-all">${d.access_token}</code><p>Add as <b>SHOPIFY_TOKEN</b> in Vercel.</p></body></html>`);
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'POST') {
    if (!SHOPIFY_TOKEN) return res.status(500).json({ success: false, error: 'No SHOPIFY_TOKEN' });
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) { body = {}; }
      }
      if (!body || typeof body !== 'object') body = {};

      const name = body.name || '';
      const phone = body.phone || '';
      const address = body.address || '';
      const variantId = body.variantId;
      const price = body.price || 0;

      const parts = name.trim().split(' ');
      const firstName = parts[0] || 'Client';
      const lastName = parts.slice(1).join(' ') || '-';

      const orderPayload = {
        order: {
          line_items: [{ variant_id: parseInt(variantId), quantity: 1 }],
          shipping_address: {
            first_name: firstName, last_name: lastName,
            address1: address, phone: phone,
            city: 'Tunisia', country: 'Tunisia', country_code: 'TN'
          },
          billing_address: {
            first_name: firstName, last_name: lastName,
            address1: address, phone: phone,
            city: 'Tunisia', country: 'Tunisia', country_code: 'TN'
          },
          financial_status: 'pending',
          tags: 'COD',
          note: `COD Order\nName: ${name}\nPhone: ${phone}\nAddress: ${address}`
        }
      };

      const shopifyRes = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_TOKEN
          },
          body: JSON.stringify(orderPayload)
        }
      );

      const data = await shopifyRes.json();
      if (!shopifyRes.ok) throw new Error(JSON.stringify(data.errors));

      return res.status(200).json({
        success: true,
        orderId: data.order.id,
        orderName: data.order.name
      });

    } catch(e) {
      console.error('Error:', e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
