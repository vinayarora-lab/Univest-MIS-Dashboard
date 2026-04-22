import { create } from 'zustand';
import axios from 'axios';

const DEFAULT_FROM = '2024-04-01';
const DEFAULT_TO = '2025-03-31';

export const useStore = create((set, get) => ({
  // ── State ────────────────────────────────────────────────────────────────
  dashboardData: null,
  loading: false,
  error: null,
  lastUpdated: null,
  mockMode: false,
  fromDate: DEFAULT_FROM,
  toDate: DEFAULT_TO,
  activeModule: 'cashflow',
  selectedCompany: 'all', // 'all' | company name
  autoRefresh: true,
  refreshInterval: null,

  // AI Suggestions
  aiSuggestions: null,
  aiLoading: false,
  aiError: null,
  aiRawText: '',

  // ── Derived helpers ───────────────────────────────────────────────────────
  getCompanyReport(name) {
    const { dashboardData } = get();
    if (!dashboardData) return null;
    return dashboardData.companies.find((c) => c.companyName === name) || null;
  },

  getActiveData() {
    const { dashboardData, selectedCompany } = get();
    if (!dashboardData) return null;
    if (selectedCompany === 'all') return dashboardData.consolidated;
    const co = dashboardData.companies.find((c) => c.companyName === selectedCompany);
    return co ? co.report : null;
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  setActiveModule: (mod) => set({ activeModule: mod }),
  setSelectedCompany: (name) => set({ selectedCompany: name }),
  setDateRange: (from, to) => set({ fromDate: from, toDate: to }),

  async fetchDashboard() {
    const { fromDate, toDate } = get();
    set({ loading: true, error: null });
    try {
      const res = await axios.get('/api/dashboard', {
        params: { fromDate, toDate },
        timeout: 120000,
      });
      set({
        dashboardData: res.data.data,
        mockMode: res.data.mockMode,
        loading: false,
        lastUpdated: new Date(),
      });
    } catch (err) {
      set({
        loading: false,
        error: err.response?.data?.error || err.message,
      });
    }
  },

  async fetchAISuggestions() {
    const { fromDate, toDate } = get();
    set({ aiLoading: true, aiError: null, aiSuggestions: null, aiRawText: '' });
    try {
      const res = await axios.get('/api/ai/suggestions', {
        params: { fromDate, toDate },
        timeout: 60000,
      });
      set({
        aiSuggestions: res.data.suggestions,
        aiRawText: res.data.rawText || '',
        aiLoading: false,
      });
    } catch (err) {
      set({
        aiLoading: false,
        aiError: err.response?.data?.error || err.message,
      });
    }
  },

  async refreshData() {
    await axios.post('/api/refresh');
    get().fetchDashboard();
  },

  startAutoRefresh() {
    const { refreshInterval } = get();
    if (refreshInterval) return;
    const id = setInterval(() => {
      get().fetchDashboard();
    }, 600000); // 10-minute interval — matches server cache TTL to avoid wasted API calls
    set({ refreshInterval: id, autoRefresh: true });
  },

  stopAutoRefresh() {
    const { refreshInterval } = get();
    if (refreshInterval) clearInterval(refreshInterval);
    set({ refreshInterval: null, autoRefresh: false });
  },

  toggleAutoRefresh() {
    const { autoRefresh } = get();
    if (autoRefresh) get().stopAutoRefresh();
    else get().startAutoRefresh();
  },
}));
