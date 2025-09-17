# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Etsy shop automation system for a 3D printing business. It consists of:
- **automation.js** - Puppeteer-based Etsy automation script for message handling and order processing
- **3D.html** - Comprehensive business management dashboard with quote calculator, order tracking, and printer monitoring

## Essential Commands

### Running the Automation
```bash
node automation.js    # Run Etsy automation (requires .env credentials)
```

### Dependencies
- **puppeteer**: Browser automation for Etsy interaction
- **node-cron**: Schedule automated tasks
- **dotenv**: Environment variable management
- **csv-writer**: Export order data
- **node-fetch**: API requests

## Environment Configuration

The `.env` file contains Etsy credentials:
- `ETSY_EMAIL`: Shop owner email
- `ETSY_PASSWORD`: Account password  
- `ETSY_SHOP_NAME`: Shop identifier (default: 'invertedgames')

## Architecture Components

### Etsy Automation (`automation.js`)
- **EtsyAutomation class**: Main automation controller
  - `initialize()`: Sets up Puppeteer browser instance with anti-detection measures
  - `login()`: Handles Etsy authentication including 2FA support
  - `getMessages()`: Scrapes conversation/message data
  - `getNewOrders()`: Extracts order information
  - `discoverSelectors()`: Dynamic selector discovery for page elements
  - `processUnreadMessages()`: Handles unread customer conversations

### Dashboard (`3D.html`)
Single-page application with four main tabs:
1. **Dashboard**: Revenue metrics, active orders, printer status overview
2. **Quote Calculator**: STL/3MF/OBJ file upload, material/time calculation, pricing
3. **Orders**: Etsy integration, CSV import, order queue management
4. **Printers**: Real-time monitoring of multiple 3D printers (Bambu series)

### Key Features
- **Etsy API Mock**: Simulated API integration for order syncing (production would use real Etsy API v3)
- **Auto-sync**: Configurable 5-minute polling for new orders
- **Email fallback**: Since Etsy messaging API is limited, system uses email for customer communication
- **Multi-printer management**: Tracks 6 printers with status, progress, and job assignment

## Technical Details

### Browser Automation Strategy
- Uses headless: false for debugging visibility
- Anti-detection measures: webdriver property override, custom user agent
- Handles 2FA with 120-second manual input timeout
- Dynamic selector discovery for resilient scraping

### Pricing Model (Quote Calculator)
- Material: $0.03/gram
- Machine time: $2.50/hour  
- Labor: $25.00/hour
- Automatic weight/time estimation from uploaded 3D files

### Order Processing Flow
1. Etsy orders sync via API/scraping
2. Orders appear in dashboard queue
3. Manual or automatic printer assignment
4. Status tracking through production
5. Customer notification via email

## Important Notes

- The automation script includes screenshot capture on errors for debugging
- The dashboard expects connection to real Etsy API credentials for production use
- Printer integration would connect to actual Bambu printer APIs in production
- CSV import supports bulk order processing from Etsy exports