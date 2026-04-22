# Zoho Books — Cash Flow Statement Generator

Fetches data from Zoho Books API and produces a structured Cash Flow Statement in JSON, CSV, and Excel formats.

---

## Setup

### 1. Install dependencies

```bash
cd zoho-cashflow
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see "Getting Credentials" below).

### 3. Run

```bash
# Uses FROM_DATE / TO_DATE from .env
npm start

# Override dates and format via CLI
node index.js --from=2024-04-01 --to=2025-03-31 --format=excel

# Formats: json | csv | excel | all (default: all)
node index.js --format=csv
```

Output files are saved to `./reports/` by default.

---

## Getting Credentials

### Step 1 — Create a Zoho API Client

1. Go to https://api-console.zoho.com/
2. Click **Add Client** → **Self Client**
3. Note down `Client ID` and `Client Secret`

### Step 2 — Generate Refresh Token

1. In the Self Client page, go to **Generate Code**
2. Enter these scopes:
   ```
   ZohoBooks.bankaccounts.READ,ZohoBooks.transactions.READ,ZohoBooks.expenses.READ,ZohoBooks.journals.READ,ZohoBooks.creditnotes.READ,ZohoBooks.salesreceipts.READ,ZohoBooks.customerpayments.READ,ZohoBooks.vendorpayments.READ
   ```
3. Set time duration: **10 minutes**
4. Click **Create** — copy the **authorization code**
5. Exchange it for a refresh token:

```bash
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=https://www.zoho.com" \
  -d "code=YOUR_AUTH_CODE"
```

Save the `refresh_token` from the response.

### Step 3 — Get Organization ID

1. Log in to Zoho Books
2. Go to **Settings → Organization Profile**
3. The Organization ID is shown at the bottom of the page

---

## API Endpoints Used

| Endpoint | Data Fetched |
|---|---|
| `GET /bankaccounts` | Bank/cash accounts & balances |
| `GET /customerpayments` | Payments received from customers |
| `GET /salesreceipts` | Direct cash sales |
| `GET /vendorpayments` | Payments made to vendors |
| `GET /expenses` | Business expenses |
| `GET /banktransactions` | All bank-level transactions (transfers, deposits) |
| `GET /journals` | Manual journal entries (payroll, FD, investments) |
| `GET /creditnotes/refunds` | Refunds issued to customers |

---

## Output Files

| File | Contents |
|---|---|
| `reports/cashflow_report.json` | Full structured report with all transactions |
| `reports/cashflow_transactions.csv` | All transactions + summary section |
| `reports/cashflow_report.xlsx` | 3-sheet Excel: Summary, Account Balances, Transactions |

---

## Sample JSON Report Structure

```json
{
  "reportMeta": {
    "generatedAt": "2025-03-17T10:00:00.000Z",
    "fromDate": "2024-04-01",
    "toDate": "2025-03-31",
    "totalTransactions": 342
  },
  "openingBalance": {
    "total": 500000.00,
    "byAccount": [
      {
        "accountId": "acc_001",
        "accountName": "HDFC Current Account",
        "accountType": "bank_account",
        "currency": "INR",
        "openingBalance": 300000.00,
        "closingBalance": 420000.00
      }
    ]
  },
  "inflows": {
    "total": 1250000.00,
    "customerPayments": { "total": 950000.00, "count": 48, "transactions": [...] },
    "salesReceipts":    { "total": 200000.00, "count": 12, "transactions": [...] },
    "otherInflows":     { "total": 100000.00, "count": 5,  "transactions": [...] }
  },
  "outflows": {
    "total": 980000.00,
    "vendorPayments":  { "total": 500000.00, "count": 35, "transactions": [...] },
    "expenses":        { "total": 380000.00, "count": 62, "transactions": [...] },
    "creditRefunds":   { "total": 50000.00,  "count": 4,  "transactions": [...] },
    "otherOutflows":   { "total": 50000.00,  "count": 8,  "transactions": [...] }
  },
  "activities": {
    "operating":  { "inflow": 1150000.00, "outflow": 880000.00, "net": 270000.00 },
    "investing":  { "inflow": 50000.00,   "outflow": 80000.00,  "net": -30000.00 },
    "financing":  { "inflow": 50000.00,   "outflow": 20000.00,  "net": 30000.00 }
  },
  "summary": {
    "openingBalance": 500000.00,
    "totalInflow": 1250000.00,
    "totalOutflow": 980000.00,
    "netCashFlow": 270000.00,
    "closingBalance": 770000.00,
    "netOperatingCashFlow": 270000.00,
    "netInvestingCashFlow": -30000.00,
    "netFinancingCashFlow": 30000.00
  }
}
```

---

## Activity Classification

| Activity | Includes |
|---|---|
| **Operating** | Customer payments, sales receipts, vendor payments, regular expenses, payroll |
| **Investing** | Fixed assets, equipment, fixed deposits, mutual funds, investments |
| **Financing** | Loans, loan repayments, interest, equity, share capital, dividends |
| **Transfer** | Inter-account fund transfers |

> Payroll/FD/investments are classified via journal entry account names.
> You can extend `classifyJournalActivity()` in `src/fetchers.js` to add custom rules.

---

## Region Support

Set `ZOHO_REGION` in `.env` based on your Zoho account:

| Region | Value |
|---|---|
| United States | `com` |
| India | `in` |
| Europe | `eu` |
| Australia | `com.au` |
| Japan | `jp` |

---

## Project Structure

```
zoho-cashflow/
├── index.js              # Entry point
├── src/
│   ├── zohoClient.js     # OAuth + HTTP client with pagination
│   ├── fetchers.js       # Per-resource data fetchers
│   ├── categorizer.js    # Report assembly & deduplication
│   └── reporters.js      # JSON / CSV / Excel writers
├── reports/              # Generated output (created automatically)
├── .env                  # Your credentials (git-ignored)
├── .env.example          # Template
└── package.json
```
