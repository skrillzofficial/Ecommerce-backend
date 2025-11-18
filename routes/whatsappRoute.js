const express = require('express');
const router = express.Router();
const twilioWhatsAppService = require('../service/twilioWhatsAppService');

// WhatsApp webhook endpoint
router.post('/webhook', async (req, res) => {
  console.log('📱 WhatsApp webhook received:', req.body);
  
  const incomingMessage = req.body.Body;
  const senderNumber = req.body.From;
  
  // Immediately acknowledge receipt (Twilio requirement)
  res.status(200).send('OK');
  
  // Process message asynchronously
  try {
    await twilioWhatsAppService.handleIncomingMessage(senderNumber, incomingMessage);
  } catch (error) {
    console.error('Webhook processing error:', error);
  }
});

// Optional: Test endpoint to send messages
router.post('/test-send', async (req, res) => {
  try {
    const { to, message } = req.body;
    const result = await twilioWhatsAppService.sendMessage(to, message);
    res.json({ success: true, messageId: result.sid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;