// notifications.js
// WhatsApp notification helpers (best-effort, never throw)

const axios = require('axios');
const { CUSTOMER_CARE_PHONE } = require('../shared');

function normalizeForWA(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

async function sendWhatsAppText(to, text) {
  const toNumber = normalizeForWA(to);
  if (!toNumber) return;
  await axios.post(
    `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: toNumber,
      type: 'text',
      text: { body: text }
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

async function sendOrderConfirmation(phoneNumber, orderNumber, totalAmount, itemCount) {
  const message = `✅ *Order Confirmed!*\n\nOrder: ${orderNumber}\nItems: ${itemCount}\nTotal: Rs. ${totalAmount} (VAT inclusive)\n\nWe'll update you when your order is dispatched. Thank you for choosing Satkam! 🙏`;
  try {
    await sendWhatsAppText(phoneNumber, message);
    console.log(`Order confirmation sent to ${phoneNumber} for ${orderNumber}`);
  } catch (err) {
    console.error('Failed to send order confirmation:', err.message);
  }
}

async function sendOrderStatusNotification(phoneNumber, orderNumber, status, extras = {}) {
  const customerCare = CUSTOMER_CARE_PHONE;
  let message;
  switch (status) {
    case 'confirmed':
      message = `✅ Your order ${orderNumber} has been confirmed and is being prepared.`;
      break;
    case 'processing':
      message = `📦 Your order ${orderNumber} is being packed for dispatch.`;
      break;
    case 'completed':
      message = `🚚 Your order ${orderNumber} has been dispatched! Expected delivery: ${extras.expected_delivery_days || '2-5'} days.`;
      break;
    case 'cancelled':
      message = `❌ Your order ${orderNumber} has been cancelled. Contact us at ${customerCare} for questions.`;
      break;
    default:
      return; // No notification for other statuses
  }
  try {
    await sendWhatsAppText(phoneNumber, message);
    console.log(`Status notification (${status}) sent to ${phoneNumber} for ${orderNumber}`);
  } catch (err) {
    console.error('Failed to send order status notification:', err.message);
  }
}

module.exports = { sendOrderConfirmation, sendOrderStatusNotification };
