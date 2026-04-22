const express = require('express');
const router = express.Router();
const { fetchDashboardData, buildPnL, buildBalanceSheet, buildMRR } = require('../services/dataService');

router.get('/pnl', async (req, res) => {
  try {
    const data = await fetchDashboardData();
    res.json(buildPnL(data));
  } catch (err) {
    console.error('[/api/reports/pnl]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/balance-sheet', async (req, res) => {
  try {
    const data = await fetchDashboardData();
    res.json(buildBalanceSheet(data));
  } catch (err) {
    console.error('[/api/reports/balance-sheet]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/mrr', async (req, res) => {
  try {
    const data = await fetchDashboardData();
    res.json(buildMRR(data));
  } catch (err) {
    console.error('[/api/reports/mrr]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
