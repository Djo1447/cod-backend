// v6 - Full CAPI + Discount Code support
import crypto from 'crypto';

function sha256(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 8) cleaned = '216' + cleaned;
  if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
  return cleaned;
}

function generateEventId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

async function sendCAPIEvent({ eventName, eventId, userData, customData, eventSourceUrl, pixelId, accessToken }) {
  try {
    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: eventSourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: customData
      }]
    };
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    const data = await res.json();
    console.log(`CAPI ${eventName}:`, JSON.stringify(data));
    return data;
  } catch (e) {
    console.error(`CAPI ${eventName} error:`, e.message);
    return null;
  }
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
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
      if (!body || typeof body !== 'object') body = {};

      const eventType      = body.event_type || 'purchase';
      const name           = body.name    || '';
      const phone          = body.phone   || '';
      const address        = body.address || '';
      const variantId      = body.variantId;
      const price          = body.price   || 0;
      const quantity       = body.quantity || 1;
      const color          = body.color || '';
      const discountCode   = body.discount_code   || '';
      const discountAmount = parseInt(body.discount_amount) || 0; // millimes
      const utmSource      = body.utm_source   || '';
      const utmMedium      = body.utm_medium   || '';
      const utmCampaign    = body.utm_campaign || '';
      const utmId          = body.utm_id       || '';
      const utmContent     = body.utm_content  || '';
      const utmTerm        = body.utm_term     || '';
      const fullUrl        = body.full_url     || `https://${SHOPIFY_STORE}`;
      const cartToken      = body.cart_token   || '';
      const fbp            = body.fbp || '';
      const fbc            = body.fbc || '';
      const eventIdFromClient = body.event_id || null;

      const clientIp  = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
      const userAgent = req.headers['user-agent'] || '';
      const priceTND  = (price / 100).toFixed(3);
      const parts     = name.trim().split(' ');
      const firstName = parts[0] || '';
      const lastName  = parts.slice(1).join(' ') || '';
      const normalizedPhone = normalizePhone(phone);

      const userData = {
        ...(normalizedPhone && { ph: [sha256(normalizedPhone)] }),
        ...(firstName && { fn: [sha256(firstName)] }),
        ...(lastName  && { ln: [sha256(lastName)]  }),
        ct: [sha256('tunis')],
        country: [sha256('tn')],
        ...(clientIp  && { client_ip_address: clientIp }),
        ...(userAgent && { client_user_agent: userAgent }),
        ...(fbp && { fbp }),
        ...(fbc && { fbc })
      };

      if (eventType === 'add_to_cart') {
        if (!variantId) return res.status(400).json({ success: false, error: 'Missing variantId' });
        const eventId = eventIdFromClient || generateEventId();
        if (FB_PIXEL_ID && FB_CAPI_TOKEN) {
          await sendCAPIEvent({ eventName: 'AddToCart', eventId, userData,
            customData: { currency: 'TND', value: parseFloat(priceTND), content_type: 'product',
              content_ids: [String(variantId)], contents: [{ id: String(variantId), quantity: parseInt(quantity) }] },
            eventSourceUrl: fullUrl, pixelId: FB_PIXEL_ID, accessToken: FB_CAPI_TOKEN });
        }
        return res.status(200).json({ success: true, event_id: eventId });
      }

      if (eventType === 'initiate_checkout') {
        if (!variantId) return res.status(400).json({ success: false, error: 'Missing variantId' });
        const eventId = eventIdFromClient || generateEventId();
        if (FB_PIXEL_ID && FB_CAPI_TOKEN) {
          await sendCAPIEvent({ eventName: 'InitiateCheckout', eventId, userData,
            customData: { currency: 'TND', value: parseFloat(priceTND), content_type: 'product',
              content_ids: [String(variantId)], contents: [{ id: String(variantId), quantity: parseInt(quantity) }],
              num_items: parseInt(quantity) },
            eventSourceUrl: fullUrl, pixelId: FB_PIXEL_ID, accessToken: FB_CAPI_TOKEN });
        }
        return res.status(200).json({ success: true, event_id: eventId });
      }

      // PURCHASE
      if (!variantId)      return res.status(400).json({ success: false, error: 'Missing variantId' });
      if (!name.trim())    return res.status(400).json({ success: false, error: 'Missing name' });
      if (!phone.trim())   return res.status(400).json({ success: false, error: 'Missing phone' });
      if (!address.trim()) return res.status(400).json({ success: false, error: 'Missing address' });

      const orderPayload = {
        order: {
          customer: { first_name: firstName || 'Client', last_name: lastName || '.' },
          line_items: [{ variant_id: parseInt(variantId), quantity: parseInt(quantity), price: (productPriceCents / quantity / 100).toFixed(3) }],
          shipping_lines: [{
            title: body.paid_delivery ? 'التوصيل' : 'توصيل بلاش',
            price: body.paid_delivery ? '5.000' : '0.000',
            code: 'COD_DELIVERY', source: 'farhat_store'
          }],
          shipping_address: {
            first_name: firstName || 'Client', last_name: lastName || '.',
            address1: address, phone, city: 'Tunisia', country: 'Tunisia', country_code: 'TN'
          },
          billing_address: {
            first_name: firstName || 'Client', last_name: lastName || '.',
            address1: address, phone, city: 'Tunisia', country: 'Tunisia', country_code: 'TN'
          },
          financial_status: 'pending',
          tags: discountCode ? `COD, discount:${discountCode}` : 'COD',
          note: `COD Order\nName: ${name}\nPhone: ${phone}\nAddress: ${address}\nQty: ${quantity}${discountCode ? `\nDiscount: ${discountCode} (-${(discountAmount/1000).toFixed(3)} DT)` : ''}`,
          note_attributes: [
            { name: 'رقم الهاتف',        value: phone },
            { name: 'العنوان',            value: address },
            { name: 'quantity',           value: String(quantity) },
            { name: 'اللون',              value: color },
            { name: 'country',            value: 'TN' },
            { name: 'discount_code',      value: discountCode },
            { name: 'discount_amount',    value: discountAmount ? `${(discountAmount/1000).toFixed(3)} DT` : '' },
            { name: 'utm_source',         value: utmSource },
            { name: 'utm_medium',         value: utmMedium },
            { name: 'utm_campaign',       value: utmCampaign },
            { name: 'utm_id',             value: utmId },
            { name: 'utm_content',        value: utmContent },
            { name: 'utm_term',           value: utmTerm },
            { name: 'full_url',           value: fullUrl },
            { name: 'shopify-cart-token', value: cartToken }
          ],
          ...(discountCode && discountAmount > 0 && {
            applied_discount: {
              description: `Coupon: ${discountCode}`,
              value_type:  'fixed_amount',
              value:       (discountAmount / 1000).toFixed(3),
              amount:      (discountAmount / 1000).toFixed(3),
              title:       discountCode
            }
          })
        }
      };

      const shopifyRes = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2025-01/orders.json`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN }, body: JSON.stringify(orderPayload) }
      );
      const data = await shopifyRes.json();
      if (!shopifyRes.ok) throw new Error(JSON.stringify(data.errors));

      const eventId = eventIdFromClient || `order_${data.order.id}`;
      if (FB_PIXEL_ID && FB_CAPI_TOKEN) {
        await sendCAPIEvent({ eventName: 'Purchase', eventId, userData,
          customData: { currency: 'TND', value: parseFloat(priceTND), content_type: 'product',
            content_ids: [String(variantId)], contents: [{ id: String(variantId), quantity: parseInt(quantity) }],
            num_items: parseInt(quantity), order_id: String(data.order.id) },
          eventSourceUrl: fullUrl, pixelId: FB_PIXEL_ID, accessToken: FB_CAPI_TOKEN });
      }

      return res.status(200).json({ success: true, orderId: data.order.id, orderName: data.order.name, event_id: eventId });

    } catch(e) {
      console.error('Error:', e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
