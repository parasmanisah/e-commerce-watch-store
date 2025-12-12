const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const path = require('path');

const app = express();
app.use(bodyParser.json());

// Serve static files (HTML, CSS, JS, images, product.json)
app.use(express.static(path.join(__dirname)));

// Khalti initiate endpoint (dev environment)
app.post('/pay/khalti', (req, res) => {
  const { amount, orderId, orderName, customer } = req.body;

  const options = {
    method: 'POST',
    url: 'https://dev.khalti.com/api/v2/epayment/initiate/',
    headers: {
      Authorization: 'key live_secret_key_68791341fdd94846a146f0457ff7b455',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      return_url: 'http://localhost:3000/payment-success.html',
      website_url: 'http://localhost:3000/',
      amount: amount, // NPR in paisa
      purchase_order_id: orderId,
      purchase_order_name: orderName,
      customer_info: {
        name: customer?.name || 'Customer',
        email: customer?.email || 'customer@example.com',
        phone: customer?.phone || '9800000000'
      }
    }),
  };

  request(options, function (error, response) {
    if (error) {
      console.error('Khalti initiate error:', error);
      return res.status(500).json({ error: 'Payment initiation failed' });
    }
    try {
      const parsed = JSON.parse(response.body);
      res.json(parsed);
    } catch (e) {
      res.status(500).json({ error: 'Invalid response from Khalti' });
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ORA server running on http://localhost:${PORT}`));
