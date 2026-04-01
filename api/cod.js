export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHOPIFY_STORE   = process.env.SHOPIFY_STORE;
  const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
  const SHOPIFY_SECRET  = process.env.SHOPIFY_API_SECRET;
  const SHOPIFY_TOKEN   = process.env.SHOPIFY_TOKEN;

  // --- OAUTH CALLBACK (GET) ---
  if (req.method === 'GET') {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'No code provided' });

    try {
      const tokenRes = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: SHOPIFY_API_KEY,
          client_secret: SHOPIFY_SECRET,
          code: code
        })
      });

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      return res.status(200).send(`
        <html>
          <body style="font-family:sans-serif;text-align:center;padding:40px;">
            <h2>App installed successfully!</h2>
            <p>Your access token is:</p>
            <code style="background:#f0f0f0;padding:10px;display:block;margin:20px auto;max-width:600px;word-break:break-all;">
              ${accessToken}
            </code>
            <p>Copy this token and add it as <strong>SHOPIFY_TOKEN</strong> in your Vercel environment variables.</p>
          </body>
        </html>
      `);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // --- CREATE ORDER (POST) ---
  if (req.method === 'POST') {
    if (!SHOPIFY_TOKEN) {
      return res.status(500).json({ error: 'SHOPIFY_TOKEN not set' });
    }

    try {
      const { name, phone, address, productTitle, variantId, price } = req.body;

      const nameParts = (name || '').trim().split(' ');
      const firstName = nameParts[0];
      const lastName  = nameParts.slice(1).join(' ') || '-';

      const orderPayload = {
        order: {
          line_items: [{ variant_id: parseInt(variantId), quantity: 1 }],
          customer: { first_name: firstName, last_name: lastName, phone: phone },
          shipping_address: {
            first_name: firstName, last_name: lastName,
            address1: address, phone: phone,
            city: '', country: 'Tunisia', country_code: 'TN'
          },
          billing_address: {
            first_name: firstName, last_name: lastName,
            address1: address, phone: phone,
            city: '', country: 'Tunisia', country_code: 'TN'
          },
          financial_status: 'pending',
          tags: 'COD, دفع-عند-الاستلام',
          note: `COD Order\nName: ${name}\nPhone: ${phone}\nAddress: ${address}`,
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

      const shopifyData = await shopifyRes.json();
      if (!shopifyRes.ok) throw new Error(JSON.stringify(shopifyData.errors));

      return res.status(200).json({
        success: true,
        orderId: shopifyData.order.id,
        orderName: shopifyData.order.name
      });

    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
