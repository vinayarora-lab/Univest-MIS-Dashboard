const express = require('express');
const router = express.Router();
const { fetchDashboardData, buildCohorts } = require('../services/dataService');

router.get('/', async (req, res) => {
  try {
    const data = await fetchDashboardData();
    res.json(buildCohorts(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
