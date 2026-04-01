export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, phone, address, productTitle, variantId, price } = req.body;

    const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
    const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;

    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName  = nameParts.slice(1).join(' ') || '-';

    const orderPayload = {
      order: {
        line_items: [{ variant_id: parseInt(variantId), quantity: 1 }],
        customer: { first_name: firstName, last_name: lastName, phone: phone },
        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          address1: address,
          phone: phone,
          city: '',
          country: 'Tunisia',
          country_code: 'TN'
        },
        billing_address: {
          first_name: firstName,
          last_name: lastName,
          address1: address,
          phone: phone,
          city: '',
          country: 'Tunisia',
          country_code: 'TN'
        },
        financial_status: 'pending',
        tags: 'COD, دفع-عند-الاستلام',
        note: `طلب COD\nالاسم: ${name}\nالهاتف: ${phone}\nالعنوان: ${address}`,
        transactions: [{
          kind: 'authorization',
          status: 'success',
          amount: (price / 100).toFixed(2),
          gateway: 'cash_on_delivery'
        }]
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

    if (!shopifyRes.ok) {
      throw new Error(JSON.stringify(shopifyData.errors));
    }

    return res.status(200).json({
      success: true,
      orderId: shopifyData.order.id,
      orderName: shopifyData.order.name
    });

  } catch (err) {
    console.error('COD Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
