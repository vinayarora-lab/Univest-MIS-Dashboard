import React, { useEffect } from 'react';
import Layout from './components/Layout';
import TreasuryOverview from './components/modules/TreasuryOverview';
import CashInBank from './components/modules/CashInBank';
import InvestmentPortfolio from './components/modules/InvestmentPortfolio';
import AISuggestions from './components/modules/AISuggestions';
import MonthlyOverview from './components/modules/MonthlyOverview';
import SearchChat from './components/SearchChat';
import { useStore } from './store/useStore';

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bloomberg-bg">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-bloomberg-accent/30 border-t-bloomberg-accent rounded-full animate-spin mx-auto" />
        <div className="text-bloomberg-accent font-bold text-lg tracking-widest">FININTL</div>
        <div className="text-bloomberg-muted text-sm">Loading financial data...</div>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bloomberg-bg">
      <div className="card p-8 max-w-lg text-center space-y-4">
        <div className="text-4xl">⚠</div>
        <div className="text-bloomberg-red font-bold">Failed to load data</div>
        <div className="text-bloomberg-muted text-sm leading-relaxed">{error}</div>
        <div className="text-bloomberg-muted text-xs border-t border-bloomberg-border pt-4">
          Check that the server is running: <code className="text-bloomberg-accent">cd dashboard/server && node index.js</code>
        </div>
        <button onClick={onRetry} className="btn-primary w-full justify-center">
          Retry
        </button>
      </div>
    </div>
  );
}

const MODULE_COMPONENTS = {
  'treasury': TreasuryOverview,
  'cash-bank': CashInBank,
  'investments': InvestmentPortfolio,
  'monthly-overview': MonthlyOverview,
  'ai': AISuggestions,
};

export default function App() {
  const { fetchDashboard, loading, error, dashboardData, activeModule, startAutoRefresh } = useStore();

  useEffect(() => {
    fetchDashboard();
    startAutoRefresh();
  }, []);

  if (loading && !dashboardData) return <LoadingScreen />;
  if (error && !dashboardData) return <ErrorScreen error={error} onRetry={fetchDashboard} />;

  const ActiveModule = MODULE_COMPONENTS[activeModule] || TreasuryOverview;

  return (
    <Layout>
      <ActiveModule />
      <SearchChat />
    </Layout>
  );
}
