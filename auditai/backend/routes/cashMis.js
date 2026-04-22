const express = require('express');
const router = express.Router();
const { getCashMISSummary } = require('../services/cashMisService');

router.get('/summary', async (req, res) => {
  try {
    const data = await getCashMISSummary();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
