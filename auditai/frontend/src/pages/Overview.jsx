import React, { useEffect, useState } from 'react';
import MetricCards from '../components/MetricCards';
import RevenueChart from '../components/RevenueChart';
import CohortTable from '../components/CohortTable';
import api from '../api/client';

export default function Overview() {
  const [mrrData, setMrrData] = useState(null);
  const [cohortData, setCohortData] = useState(null);

  useEffect(() => {
    api.get('/api/reports/mrr').then(r => setMrrData(r.data)).catch(() => {});
    api.get('/api/cohorts').then(r => setCohortData(r.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6 max-w-6xl">
      <MetricCards />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Monthly Revenue Trend</h2>
          <RevenueChart data={mrrData} />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Customer Cohort Retention</h2>
          <CohortTable data={cohortData} />
        </div>
      </div>
    </div>
  );
}
