const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

router.get('/', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/auditlog.json'), 'utf8'));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const filtered = data.entries.filter(e => new Date(e.timestamp) >= cutoff);
  res.json({ entries: filtered, total: filtered.length });
});

module.exports = router;
