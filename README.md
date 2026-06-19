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

`/api/geocode/reverse` reverse-geocodes a clicked map location for the valuation target address, with coordinate fallback when an address cannot be resolved.

The Reinfolib routes send `Ocp-Apim-Subscription-Key` from `process.env.REINFOLIB_API_KEY`. If the key is missing or the request fails, the UI falls back to mock transaction/public land-price data and shows a warning banner.

## Demo Flow

1. Initial load shows the Osaka / Moriguchi / Miyakojima area.
2. The 11-row CSV is loaded into the map and table.
3. No comparable cases or public land-price points are selected by default.
4. Click table checkboxes or map pins to select/unselect comparable cases.
5. Switch `情報種別` to `公示地価`, then click public land-price pins or table checkboxes to choose the land-price points used for the growth rate.
6. Click administrative map areas to filter the visible pins/table for the current `情報種別`.
7. Use `査定地指定` to place the valuation target pin directly on the map and update `所在地`.
8. The average 坪単価, 上昇率, 査定金額, and 入札額 update automatically when selections, 用地坪数, or 補正係数 change.

## How To Use The Dashboard

1. Choose `情報種別`.
   - `取引事例` shows Real Estate Information Library transaction data.
   - `全事例` shows Real Estate Information Library transaction data and the preloaded CSV data together.
   - `成約事例` and `自社データ` show the preloaded CSV data.
   - `公示地価` focuses the map/table on public land-price point selection.
2. Confirm or edit `所在地`, or use `査定地指定` on the map to place the target pin and update `所在地`.
3. Enter `敷地面積` in tsubo.
4. Use the `エリア` map.
   - Click a colored administrative area to limit visible rows and pins for the current `情報種別`.
   - Use `全物件表示` / `全地点表示` to return to all visible data.
   - Use the map display menu to show all administrative boundaries or only areas with market data.
5. Select data for calculation.
   - In case modes, click a map case pin or the table checkbox to include/exclude that comparable case.
   - In `公示地価` mode, click a public land-price pin or the public land-price table checkbox to include/exclude that point.
6. Review `地価推移` and the public land-price history table. These reflect the selected public land-price points.
7. Set `補正係数` in the calculation row when the bid should be adjusted above or below the appraisal amount.
8. Read the result boxes.
   - `単価相場`: average selected comparable case unit price.
   - `上昇率`: average recent year-on-year change from selected public land-price points.
   - `査定金額`: land size × unit price × land-price growth multiplier.
   - `入札額`: appraisal amount adjusted by the correction coefficient.

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

