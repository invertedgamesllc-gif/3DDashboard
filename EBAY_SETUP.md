# eBay Integration Setup Guide

## Overview
The dashboard now includes a dedicated **eBay Orders** tab to manage and fulfill your eBay orders directly from the 3D Print Business Manager.

## Features
- Sync orders from eBay API
- View all eBay orders with ship-by dates
- Track urgent orders (shipping within 24 hours)
- Add tracking numbers
- Mark orders as shipped
- Full shipping address display
- Order status management

## Setup Instructions

### 1. Configure eBay API Secrets in Cloudflare

The eBay API credentials are stored securely as Cloudflare Worker secrets (not in the code). You need to set them up once using the Wrangler CLI.

Run these commands in your terminal:

```bash
# Set your Cloudflare API token (get from Cloudflare dashboard)
set CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here

# Set each eBay credential as a secret
npx wrangler secret put EBAY_APP_ID --name etsy-3d-print-api
# When prompted, enter your eBay App ID (Client ID) from developer portal

npx wrangler secret put EBAY_DEV_ID --name etsy-3d-print-api
# When prompted, enter your eBay Dev ID from developer portal

npx wrangler secret put EBAY_CERT_ID --name etsy-3d-print-api
# When prompted, enter your eBay Cert ID (Client Secret) from developer portal

npx wrangler secret put EBAY_USER_TOKEN --name etsy-3d-print-api
# When prompted, enter your eBay User Token (starts with v^1.1...)
# Get this from: https://developer.ebay.com/my/auth/?env=production
```

**Note:** Each command will prompt you to enter the value securely. The values won't be visible in your terminal history.

### 2. Verify Database Table

The eBay orders table has been automatically created in your Cloudflare D1 database with the following schema:

- Order ID, buyer info, item details
- Shipping address fields
- Ship-by date and delivery date
- Tracking number
- Order status and payment status
- Timestamps for created, paid, and shipped

## Using the eBay Orders Tab

### Accessing eBay Orders
1. Log in to your dashboard at https://invertedgamesllc-gif.github.io/3DDashboard/
2. Click on the **eBay Orders** tab in the navigation

### Syncing Orders from eBay
1. Click the **🔄 Sync from eBay** button
2. The system will fetch all current orders from your eBay account
3. New orders will be added, existing orders will be updated

### Managing Orders
Each order displays:
- **Order ID**: eBay order number
- **Buyer**: Username and email
- **Item**: Product title, SKU, and quantity
- **Ship To**: Full shipping address
- **Ship By**: Due date (highlighted in red if within 24 hours)
- **Total**: Order value
- **Tracking**: Add or view tracking number
- **Status**: Current fulfillment status

### Adding Tracking Numbers
1. Click **+ Add Tracking** button for an order
2. Enter the tracking number when prompted
3. The order will automatically be marked as shipped

### Marking as Shipped
- Click the **Ship** button to mark an order as shipped
- This updates the order status and sets the shipped timestamp

## Order Statistics
The top of the eBay Orders tab shows:
- **⏰ Urgent**: Orders that need to ship within 24 hours
- **📦 Pending**: Orders awaiting fulfillment
- **✅ Shipped**: Orders shipped this week

## API Endpoints
The following endpoints are available in the worker:

- `GET /api/ebay-orders` - Fetch all eBay orders
- `POST /api/ebay-orders/sync` - Sync orders from eBay API
- `PUT /api/ebay-orders/:id` - Update order (tracking, status)
- `DELETE /api/ebay-orders/:id` - Delete an order

## Troubleshooting

### Orders not syncing
- Verify your eBay User Token is valid and not expired
- Check that all four secrets are set correctly in Cloudflare
- Ensure your eBay account has API access enabled

### "Failed to sync eBay orders" error
- Check browser console for detailed error messages
- Verify your eBay API credentials are correct
- Make sure your token has the correct scopes: `https://api.ebay.com/oauth/api_scope/sell.fulfillment`

### Token expiration
Your eBay User Token expires on **Sat, 12 Jun 2027 20:50:16 GMT**.

To refresh it before expiration:
1. Visit https://developer.ebay.com/my/auth/?env=production
2. Generate a new User Token
3. Update the secret: `npx wrangler secret put EBAY_USER_TOKEN --name etsy-3d-print-api`

## Security Notes
- eBay credentials are **never stored in the code** or GitHub
- All credentials are stored as Cloudflare Worker secrets
- API calls are made server-side only, never from the browser
- User authentication is required for all eBay operations

## Next Steps
- The eBay tab is now live at https://invertedgamesllc-gif.github.io/3DDashboard/
- Complete the secret setup above to enable eBay API integration
- Click "Sync from eBay" to import your orders
