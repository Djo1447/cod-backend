// v4 - CAPI with hashed user data
import crypto from 'crypto';

function sha256(value) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHOPIFY_STORE  = process.env.SHOPIFY_STORE;
  const SHOPIFY_KEY    = process.env.SHOPIFY_API_KEY;
  const SHOPIFY_SECRET = process.env.SHOPIFY_API_SECRET;
  const SHOPIFY_TOKEN  = process.env.SHOPIFY_TOKEN;
  const FB_PIXEL_ID    = process.env.FB_PIXEL_ID;
  const FB_CAPI_TOKEN  = process.env.FB_CAPI_TOKEN;

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

      const name      = body.name    || '';
      const phone     = body.phone   || '';
      const address   = body.address || '';
      const variantId = body.variantId;
      const price     = body.price   || 0;

      if (!variantId)      return res.status(400).json({ success: false, error: 'Missing variantId' });
      if (!name.trim())    return res.status(400).json({ success: false, error: 'Missing name' });
      if (!phone.trim())   return res.status(400).json({ success: false, error: 'Missing phone' });
      if (!address.trim()) return res.status(400).json({ success: false, error: 'Missing address' });

      const utmSource   = body.utm_source   || '';
      const utmMedium   = body.utm_medium   || '';
      const utmCampaign = body.utm_campaign || '';
      const utmId       = body.utm_id       || '';
      const utmContent  = body.utm_content  || '';
      const utmTerm     = body.utm_term     || '';
      const fullUrl     = body.full_url     || '';
      const cartToken   = body.cart_token   || '';
      const fbp         = body.fbp          || '';
      const fbc         = body.fbc          || '';

      const parts     = name.trim().split(' ');
      const firstName = parts[0] || 'Client';
      const lastName  = parts.slice(1).join(' ') || '-';
      const totalTND  = ((price / 100) + 7).toFixed(3);

      const orderPayload = {
        order: {
          customer: {
            first_name: firstName,
            last_name: lastName,
            phone: phone
          },
          line_items: [{ variant_id: parseInt(variantId), quantity: 1 }],
          shipping_lines: [{
            title: 'توصيل بلاش',
            price: '0.00',
            code: 'COD_DELIVERY',
            source: 'farhat_store'
          }],
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
          note: `COD Order\nName: ${name}\nPhone: ${phone}\nAddress: ${address}`,
          note_attributes: [
            { name: 'رقم الهاتف',        value: phone },
            { name: 'العنوان',            value: address },
            { name: 'country',            value: 'TN' },
            { name: 'utm_source',         value: utmSource },
            { name: 'utm_medium',         value: utmMedium },
            { name: 'utm_campaign',       value: utmCampaign },
            { name: 'utm_id',             value: utmId },
            { name: 'utm_content',        value: utmContent },
            { name: 'utm_term',           value: utmTerm },
            { name: 'full_url',           value: fullUrl },
            { name: 'shopify-cart-token', value: cartToken }
          ]
        }
      };

      const shopifyRes = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2025-01/orders.json`,
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

      // ── Facebook CAPI with hashed user data
      if (FB_PIXEL_ID && FB_CAPI_TOKEN) {
        try {
          const capiPayload = {
            data: [{
              event_name: 'Purchase',
              event_time: Math.floor(Date.now() / 1000),
              event_source_url: fullUrl || `https://${SHOPIFY_STORE}`,
              action_source: 'website',
              user_data: {
                ph: [sha256(phone)],
                ...(fbp && { fbp }),
                ...(fbc && { fbc })
              },
              custom_data: {
                currency: 'TND',
                value: parseFloat(totalTND),
                content_type: 'product',
                content_ids: [String(variantId)],
                order_id: String(data.order.id)
              }
            }]
          };

          const capiRes = await fetch(
            `https://graph.facebook.com/v19.0/${FB_PIXEL_ID}/events?access_token=${FB_CAPI_TOKEN}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(capiPayload)
            }
          );
          const capiData = await capiRes.json();
          console.log('CAPI response:', JSON.stringify(capiData));
        } catch(e) {
          console.error('CAPI error:', e.message);
        }
      }

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
