const express = require('express');
const router = express.Router();
const { askAI } = require('../services/geminiService');

// POST /api/ai/chat - chatbot query handler (public access)
router.post('/chat', async (req, res, next) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const reply = await askAI(message);
    res.json({ success: true, reply });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
