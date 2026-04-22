require('dotenv').config();
// Also load Zoho credentials from parent project .env
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), override: false });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const chatRoutes = require('./routes/chat');
const reportsRoutes = require('./routes/reports');
const cohortsRoutes = require('./routes/cohorts');
const auditlogRoutes = require('./routes/auditlog');
const complianceRoutes = require('./routes/compliance');
const datapackRoutes = require('./routes/datapack');
const ledgerRoutes = require('./routes/ledger');
const cfoRoutes = require('./routes/cfo');
const cashMisRoutes = require('./routes/cashMis');
const treasuryRoutes = require('../../dashboard/server/routes/api');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json());

app.use('/api/chat', chatRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/cohorts', cohortsRoutes);
app.use('/api/auditlog', auditlogRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/datapack', datapackRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/cfo', cfoRoutes);
app.use('/api/cash-mis', cashMisRoutes);
app.use('/api', treasuryRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serve built treasury dashboard client at /treasury
const treasuryDist = path.resolve(__dirname, '../../dashboard/client/dist');
if (fs.existsSync(treasuryDist)) {
  app.use('/treasury', express.static(treasuryDist));
  app.get('/treasury/*', (req, res) => res.sendFile(path.join(treasuryDist, 'index.html')));
}

// Serve built MIS frontend (catch-all must be last)
const frontendDist = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`AuditAI backend running on http://localhost:${PORT}`);
});
