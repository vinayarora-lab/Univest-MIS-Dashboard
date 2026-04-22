import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function formatINR(val) {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  return `₹${val}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
        <p className="font-semibold text-gray-700 mb-1">{label}</p>
        <p className="text-[#185FA5]">Revenue: {formatINR(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export default function RevenueChart({ data }) {
  if (!data) return <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading chart...</div>;

  const chartData = data.months.map((month, i) => ({
    month: month.replace(' 2024', "'24").replace(' 2025', "'25"),
    revenue: data.total[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} />
        <YAxis tickFormatter={formatINR} tick={{ fontSize: 11, fill: '#6b7280' }} width={70} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="revenue" fill="#185FA5" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
