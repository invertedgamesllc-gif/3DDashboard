// Cloudflare Sync Module - Replaces Google Drive
// Syncs all data with Cloudflare D1 database and R2 storage

class CloudflareSync {
    constructor() {
        // Get worker URL from environment or use default
        this.workerUrl = process.env.CLOUDFLARE_WORKER_URL || 'http://localhost:8787';
        this.isConnected = false;
        this.syncInterval = null;
    }

    // Initialize connection to Cloudflare
    async initialize() {
        try {
            const response = await fetch(`${this.workerUrl}/api/sync-status`);
            if (response.ok) {
                const status = await response.json();
                this.isConnected = status.connected;
                console.log('✅ Cloudflare sync initialized');
                console.log(`📊 Stats: ${status.stats.inquiries} inquiries, ${status.stats.orders} orders, ${status.stats.files} files`);
                return true;
            }
        } catch (error) {
            console.error('Failed to initialize Cloudflare sync:', error);
            this.isConnected = false;
            return false;
        }
    }

    // Upload files to R2
    async uploadFiles(files) {
        try {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });

            const response = await fetch(`${this.workerUrl}/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            console.log(`✅ Uploaded ${result.files.length} files to Cloudflare R2`);
            return result.files;
        } catch (error) {
            console.error('Failed to upload files:', error);
            throw error;
        }
    }

    // Upload file from path (for server-side uploads)
    async uploadFileFromPath(filePath, originalName) {
        const fs = require('fs');
        const FormData = require('form-data');

        try {
            const form = new FormData();
            form.append('files', fs.createReadStream(filePath), {
                filename: originalName
            });

            const response = await fetch(`${this.workerUrl}/api/upload`, {
                method: 'POST',
                body: form,
                headers: form.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            console.log(`✅ Uploaded ${originalName} to Cloudflare R2`);
            return result.files[0];
        } catch (error) {
            console.error('Failed to upload file:', error);
            throw error;
        }
    }

    // Download file from R2
    async downloadFile(fileKey) {
        try {
            const response = await fetch(`${this.workerUrl}/api/download/${fileKey}`);

            if (!response.ok) {
                throw new Error('Download failed');
            }

            return response;
        } catch (error) {
            console.error('Failed to download file:', error);
            throw error;
        }
    }

    // Sync inquiries to D1
    async syncInquiries(inquiries) {
        try {
            const results = [];

            for (const inquiry of inquiries) {
                const response = await fetch(`${this.workerUrl}/api/inquiries`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(inquiry)
                });

                if (response.ok) {
                    const result = await response.json();
                    results.push(result);
                }
            }

            console.log(`✅ Synced ${results.length} inquiries to Cloudflare D1`);
            return results;
        } catch (error) {
            console.error('Failed to sync inquiries:', error);
            return [];
        }
    }

    // Get all inquiries from D1
    async getInquiries() {
        try {
            const response = await fetch(`${this.workerUrl}/api/inquiries`);

            if (!response.ok) {
                throw new Error('Failed to fetch inquiries');
            }

            const data = await response.json();
            return data.inquiries || [];
        } catch (error) {
            console.error('Failed to get inquiries:', error);
            return [];
        }
    }

    // Sync orders to D1
    async syncOrders(orders) {
        try {
            const results = [];

            for (const order of orders) {
                const response = await fetch(`${this.workerUrl}/api/orders`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(order)
                });

                if (response.ok) {
                    const result = await response.json();
                    results.push(result);
                }
            }

            console.log(`✅ Synced ${results.length} orders to Cloudflare D1`);
            return results;
        } catch (error) {
            console.error('Failed to sync orders:', error);
            return [];
        }
    }

    // Get all orders from D1
    async getOrders() {
        try {
            const response = await fetch(`${this.workerUrl}/api/orders`);

            if (!response.ok) {
                throw new Error('Failed to fetch orders');
            }

            const data = await response.json();
            return data.orders || [];
        } catch (error) {
            console.error('Failed to get orders:', error);
            return [];
        }
    }

    // Get inventory from D1
    async getInventory() {
        try {
            const response = await fetch(`${this.workerUrl}/api/inventory`);

            if (!response.ok) {
                throw new Error('Failed to fetch inventory');
            }

            const data = await response.json();
            return data.inventory || [];
        } catch (error) {
            console.error('Failed to get inventory:', error);
            return [];
        }
    }

    // Full sync - upload all local data to Cloudflare
    async fullSync(data) {
        console.log('🔄 Starting full Cloudflare sync...');

        try {
            const results = {
                inquiries: 0,
                orders: 0,
                files: 0
            };

            // Sync inquiries
            if (data.inquiries && data.inquiries.length > 0) {
                const inquiryResults = await this.syncInquiries(data.inquiries);
                results.inquiries = inquiryResults.length;
            }

            // Sync orders
            if (data.orders && data.orders.length > 0) {
                const orderResults = await this.syncOrders(data.orders);
                results.orders = orderResults.length;
            }

            console.log(`✅ Full sync complete: ${results.inquiries} inquiries, ${results.orders} orders`);
            return results;
        } catch (error) {
            console.error('Full sync failed:', error);
            throw error;
        }
    }

    // Start automatic sync
    startAutoSync(interval = 300000) { // 5 minutes default
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        this.syncInterval = setInterval(async () => {
            console.log('🔄 Running automatic Cloudflare sync...');

            // Check connection status
            const response = await fetch(`${this.workerUrl}/api/sync-status`);
            if (response.ok) {
                const status = await response.json();
                console.log(`📊 Sync status: ${status.stats.inquiries} inquiries, ${status.stats.orders} orders`);
            }
        }, interval);

        console.log(`✅ Auto-sync started (every ${interval / 60000} minutes)`);
    }

    // Stop automatic sync
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('⏹️ Auto-sync stopped');
        }
    }

    // Check connection status
    async checkStatus() {
        try {
            const response = await fetch(`${this.workerUrl}/api/sync-status`);
            const status = await response.json();
            return status;
        } catch (error) {
            return { connected: false, error: error.message };
        }
    }
}

module.exports = CloudflareSync;