@echo off
echo Setting up eBay API secrets in Cloudflare...

REM Replace with your actual Cloudflare API token
set CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here

npx wrangler secret put EBAY_APP_ID --name etsy-3d-print-api
npx wrangler secret put EBAY_DEV_ID --name etsy-3d-print-api
npx wrangler secret put EBAY_CERT_ID --name etsy-3d-print-api
npx wrangler secret put EBAY_USER_TOKEN --name etsy-3d-print-api

echo.
echo eBay secrets configured!
echo.
pause
