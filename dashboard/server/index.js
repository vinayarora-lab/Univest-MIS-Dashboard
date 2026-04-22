/**
 * Financial Intelligence Dashboard — Express Server
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api', apiRoutes);

// Serve React client build in production
const clientBuild = path.resolve(__dirname, '../client/dist');
const fs = require('fs');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  const mockMode = process.env.MOCK_MODE === 'true';
  console.log(`\n Financial Intelligence Dashboard`);
  console.log(`  Server  : http://localhost:${PORT}`);
  console.log(`  Mode    : ${mockMode ? '🟡 MOCK (no Zoho API calls)' : '🟢 LIVE (Zoho Books API)'}`);
  console.log(`  AI      : ${process.env.ANTHROPIC_API_KEY ? '🟢 Anthropic connected' : '🔴 ANTHROPIC_API_KEY not set'}`);
  console.log(`  Period  : ${process.env.FROM_DATE || '2024-04-01'} → ${process.env.TO_DATE || '2025-03-31'}\n`);
});
