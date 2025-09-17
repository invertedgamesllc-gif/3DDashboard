// Official Etsy API v3 Client
// Note: Messages are NOT available via API, only orders/receipts
const fetch = require('node-fetch');

class EtsyAPIClient {
    constructor(apiKey, apiSecret = null, accessToken = null) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.accessToken = accessToken;
        this.baseUrl = 'https://openapi.etsy.com/v3';
        this.shopId = null;
    }

    // Set OAuth access token after authentication
    setAccessToken(token) {
        this.accessToken = token;
    }

    // Set shop ID
    setShopId(shopId) {
        this.shopId = shopId;
    }

    // Make authenticated API request
    async apiRequest(endpoint, method = 'GET', body = null) {
        const headers = {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
        };

        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        const options = {
            method,
            headers
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, options);
            
            if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please try again later.');
            }

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `API Error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Etsy API Error:', error);
            throw error;
        }
    }

    // Find shop by name
    async findShopByName(shopName) {
        try {
            // Search for shop by name
            const response = await this.apiRequest(`/application/shops?shop_name=${encodeURIComponent(shopName)}`);
            if (response && response.results && response.results.length > 0) {
                this.shopId = response.results[0].shop_id;
                return response.results[0];
            }
            throw new Error('Shop not found');
        } catch (error) {
            console.error('Error finding shop:', error);
            throw error;
        }
    }
    
    // Get user's shop (requires OAuth or will try to get from API key)
    async getUserShop() {
        try {
            // Try to get user's shops
            const response = await this.apiRequest('/application/users/me/shops');
            if (response && response.results && response.results.length > 0) {
                this.shopId = response.results[0].shop_id;
                return response.results[0];
            }
            throw new Error('No shop found for this user');
        } catch (error) {
            // If that fails, prompt for shop name
            console.error('Could not auto-detect shop:', error);
            throw new Error('Please provide your shop name');
        }
    }
    
    // Get shop information
    async getShop() {
        if (!this.shopId) {
            throw new Error('Shop ID not set');
        }
        return await this.apiRequest(`/application/shops/${this.shopId}`);
    }

    // Get shop receipts (orders)
    async getShopReceipts(limit = 25, offset = 0, status = null) {
        if (!this.shopId) {
            throw new Error('Shop ID not set');
        }

        let endpoint = `/application/shops/${this.shopId}/receipts?limit=${limit}&offset=${offset}`;
        
        if (status) {
            // Status can be: open, completed, canceled, all
            endpoint += `&was_shipped=${status === 'completed'}`;
        }

        return await this.apiRequest(endpoint);
    }

    // Get specific receipt details
    async getReceipt(receiptId) {
        if (!this.shopId) {
            throw new Error('Shop ID not set');
        }
        return await this.apiRequest(`/application/shops/${this.shopId}/receipts/${receiptId}`);
    }

    // Update tracking information
    async updateTracking(receiptId, trackingCode, carrier) {
        if (!this.shopId) {
            throw new Error('Shop ID not set');
        }

        return await this.apiRequest(
            `/application/shops/${this.shopId}/receipts/${receiptId}/tracking`,
            'POST',
            {
                tracking_code: trackingCode,
                carrier_name: carrier
            }
        );
    }

    // Get listings for the shop
    async getListings(state = 'active', limit = 25) {
        if (!this.shopId) {
            throw new Error('Shop ID not set');
        }
        return await this.apiRequest(`/application/shops/${this.shopId}/listings?state=${state}&limit=${limit}`);
    }

    // OAuth 2.0 Flow Methods
    
    // Step 1: Generate authorization URL
    getAuthorizationUrl(redirectUri, scope = 'shops_r transactions_r', state = null) {
        const params = new URLSearchParams({
            response_type: 'code',
            redirect_uri: redirectUri,
            scope: scope,
            client_id: this.apiKey,
            state: state || Math.random().toString(36).substring(7),
            code_challenge: this.generateCodeChallenge(),
            code_challenge_method: 'S256'
        });

        return `https://www.etsy.com/oauth/connect?${params.toString()}`;
    }

    // Generate code challenge for PKCE
    generateCodeChallenge() {
        // For simplicity, using plain method in this example
        // In production, use S256 method with proper hashing
        return 'challenge_' + Math.random().toString(36).substring(7);
    }

    // Step 2: Exchange authorization code for access token
    async exchangeCodeForToken(code, redirectUri, codeVerifier) {
        const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-api-key': this.apiKey
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: this.apiKey,
                redirect_uri: redirectUri,
                code: code,
                code_verifier: codeVerifier
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_description || 'Token exchange failed');
        }

        const tokenData = await response.json();
        this.accessToken = tokenData.access_token;
        return tokenData;
    }

    // Refresh access token
    async refreshToken(refreshToken) {
        const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-api-key': this.apiKey
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: this.apiKey,
                refresh_token: refreshToken
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_description || 'Token refresh failed');
        }

        const tokenData = await response.json();
        this.accessToken = tokenData.access_token;
        return tokenData;
    }

    // Format receipt data for easier use
    formatReceipt(receipt) {
        return {
            orderId: receipt.receipt_id,
            buyerEmail: receipt.buyer_email,
            buyerName: receipt.name,
            totalPrice: receipt.grandtotal?.amount / 100 || 0,
            currency: receipt.grandtotal?.currency_code || 'USD',
            status: receipt.is_shipped ? 'shipped' : 'pending',
            orderDate: new Date(receipt.created_timestamp * 1000),
            shipDate: receipt.shipped_timestamp ? new Date(receipt.shipped_timestamp * 1000) : null,
            items: receipt.transactions?.map(t => ({
                title: t.title,
                quantity: t.quantity,
                price: t.price?.amount / 100 || 0,
                sku: t.product_data?.sku || '',
                listingId: t.listing_id
            })) || [],
            shippingAddress: {
                name: receipt.name,
                first_line: receipt.first_line,
                second_line: receipt.second_line,
                city: receipt.city,
                state: receipt.state,
                zip: receipt.zip,
                country_iso: receipt.country_iso
            },
            messageFromBuyer: receipt.message_from_buyer || ''
        };
    }
}

module.exports = EtsyAPIClient;