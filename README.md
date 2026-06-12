# 不動産DXモック

Working mock dashboard for a Japanese real estate DX service for Panasonic Homes / P社.

## Setup

```bash
npm install
cp .env.example .env.local
```

Add an MLIT Real Estate Information Library API key when available:

```env
REINFOLIB_API_KEY=your_api_key
```

The key is read only by Next.js API routes and is never exposed to browser code.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

For a production-style local build:

```bash
npm run build
npm run start
```

## Demo Data

The dashboard loads `csv_ocr_fudousan_result_page1.csv` through `/api/demo/csv`.

The CSV is decoded as CP932 / Shift-JIS on the server, normalized into `ComparableCase`, and assigned deterministic Osaka-area coordinates when latitude and longitude are missing. The OCR typo column `浴線駅` is handled as the nearest-station field.

## API Routes

`/api/reinfolib/transactions` proxies XIT001 transaction data.

`/api/reinfolib/land-price-points` proxies XPT002 public land-price point data.

Both routes send `Ocp-Apim-Subscription-Key` from `process.env.REINFOLIB_API_KEY`. If the key is missing or the request fails, the UI falls back to mock transaction/public land-price data and shows a warning banner.

## Demo Flow

1. Initial load shows the Osaka / Moriguchi / Miyakojima area.
2. The 11-row CSV is loaded into the map and table.
3. Four CSV rows are preselected.
4. Click table checkboxes or map pins to select/unselect comparable cases.
5. The average 坪単価, 査定金額, and 入札額 update automatically.
6. Change 用地坪数 or 格差修正 and click `査定を再計算` to update the visible timestamp.
7. Use table filters for source, zoning, price, area, walking time, and transaction date.

## Mocked / Simplified

- Geocoding is deterministic mock coordinate generation from address text.
- MLIT API responses are normalized flexibly, but live field coverage may need adjustment after confirming the exact tenant/API response shape.
- Public land-price trend uses API data when available, otherwise bundled mock trend data.
- Login ID / password authentication is planned only.
- SSL/TLS is required in production.
- AWS deployment and a temporary domain under the まちしるべ domain are assumed.

## Future Production Expectations

- Availability target: 99.9%.
- Recovery time: within 30 minutes.
- Response time target: show results within 5 seconds where possible.
- Monitoring: 24/365 production monitoring.
- Security: server-side API key, HTTPS, login/password authentication.

