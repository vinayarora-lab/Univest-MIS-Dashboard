/**
 * Zoho Books API Client
 * Handles OAuth token refresh and all HTTP requests with automatic pagination.
 */

const axios = require('axios');

class ZohoClient {
  constructor(config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.refreshToken = config.refreshToken;
    this.organizationId = config.organizationId;
    this.region = config.region || 'com';

    this.accessToken = null;
    this.tokenExpiresAt = null;

    this.baseURL = `https://www.zohoapis.${this.region}/books/v3`;
    this.authURL = `https://accounts.zoho.${this.region}/oauth/v2/token`;
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  async getAccessToken() {
    const now = Date.now();
    // Reuse token if it's still valid with 60s buffer
    if (this.accessToken && this.tokenExpiresAt && now < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
    });

    const response = await axios.post(this.authURL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (response.data.error) {
      throw new Error(`OAuth error: ${response.data.error}`);
    }

    this.accessToken = response.data.access_token;
    // Zoho tokens expire in 3600s
    this.tokenExpiresAt = now + (response.data.expires_in || 3600) * 1000;

    console.log('  [auth] Access token refreshed successfully.');
    return this.accessToken;
  }

  // ---------------------------------------------------------------------------
  // Core request helper
  // ---------------------------------------------------------------------------

  async request(endpoint, params = {}, retries = 3) {
    const token = await this.getAccessToken();

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(`${this.baseURL}${endpoint}`, {
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json',
          },
          params: {
            organization_id: this.organizationId,
            ...params,
          },
        });

        if (response.data.code !== 0) {
          throw new Error(
            `Zoho API error [${response.data.code}]: ${response.data.message}`
          );
        }

        return response.data;
      } catch (err) {
        lastError = err;
        const status = err.response?.status;
        if (status === 429) {
          const remaining = err.response?.headers?.['x-rate-limit-remaining'];
          const resetSec = err.response?.headers?.['x-rate-limit-reset'];
          // If daily limit is fully exhausted (remaining=0), no point retrying
          if (remaining === '0') {
            const resetHours = resetSec ? Math.round(parseInt(resetSec) / 3600) : '?';
            console.warn(`  [api] Daily API limit exhausted for org ${this.organizationId}. Resets in ~${resetHours}h. Skipping retries.`);
            throw err;
          }
          // Temporary per-minute throttle — retry with backoff
          if (attempt < retries) {
            const delay = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
            console.warn(`  [api] 429 on ${endpoint}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }
        throw err;
      }
    }
    throw lastError;
  }

  // ---------------------------------------------------------------------------
  // Paginated fetch — automatically walks through all pages
  // ---------------------------------------------------------------------------

  async fetchAll(endpoint, dataKey, params = {}) {
    const results = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const data = await this.request(endpoint, {
        ...params,
        page,
        per_page: 200,
      });

      const items = data[dataKey] || [];
      results.push(...items);

      // Zoho returns page_context.has_more_page when more pages exist
      hasMore = data.page_context?.has_more_page === true;
      page += 1;

      if (items.length === 0) break;
    }

    return results;
  }
}

module.exports = ZohoClient;
