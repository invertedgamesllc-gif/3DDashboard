// Etsy Manual Helper - Opens regular browser for manual login
// Then uses session cookies for API-like access
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class EtsyManualHelper {
    constructor() {
        this.sessionPath = path.join(__dirname, 'etsy-manual-session.json');
    }

    // Open Etsy in default browser for manual login
    openEtsyInBrowser() {
        const url = 'https://www.etsy.com/your/shops/me/tools/listings';
        
        // Open in default browser based on platform
        const platform = process.platform;
        let command;
        
        if (platform === 'win32') {
            command = `start ${url}`;
        } else if (platform === 'darwin') {
            command = `open ${url}`;
        } else {
            command = `xdg-open ${url}`;
        }
        
        exec(command, (err) => {
            if (err) {
                console.error('Error opening browser:', err);
            } else {
                console.log('✅ Opened Etsy in your default browser');
                console.log('📝 Please login manually and navigate to your shop');
                console.log('🔑 Once logged in, copy the session cookies for API access');
            }
        });
        
        return {
            success: true,
            message: 'Please login to Etsy in your browser window',
            instructions: [
                '1. Login to your Etsy account',
                '2. Navigate to your shop dashboard',
                '3. Keep the browser window open',
                '4. Use the API method for orders',
                '5. Check messages manually in the browser'
            ]
        };
    }

    // Save manual session info
    async saveSessionInfo(shopName, shopId, apiKey = null) {
        const sessionData = {
            shopName,
            shopId,
            apiKey,
            savedAt: new Date().toISOString(),
            method: 'manual'
        };
        
        await fs.writeFile(this.sessionPath, JSON.stringify(sessionData, null, 2));
        return sessionData;
    }

    // Get saved session
    async getSession() {
        try {
            const data = await fs.readFile(this.sessionPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }
}

module.exports = EtsyManualHelper;