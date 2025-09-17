const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

// Add stealth plugin with all evasions
puppeteer.use(StealthPlugin());
// Add adblocker to prevent tracking
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

class EtsyIntegration extends EventEmitter {
    constructor() {
        super();
        this.browser = null;
        this.page = null;
        this.isAuthenticated = false;
        this.shopName = null;
        this.messagePollingInterval = null;
        this.orderPollingInterval = null;
        this.lastMessageCheck = new Date();
        this.lastOrderCheck = new Date();
        this.cookiesPath = path.join(__dirname, 'etsy-session.json');
    }

    async initialize() {
        try {
            // Launch browser with advanced anti-detection measures
            this.browser = await puppeteer.launch({
                headless: false, // Use 'new' for new headless mode if needed
                defaultViewport: null,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=site-per-process',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--window-size=1366,768',
                    '--start-maximized',
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                ],
                ignoreDefaultArgs: ['--enable-automation']
            });

            this.page = await this.browser.newPage();
            
            // Additional anti-detection measures
            await this.page.setViewport({ width: 1366, height: 768 });
            
            // Set realistic user agent
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
            
            // Override navigator properties
            await this.page.evaluateOnNewDocument(() => {
                // Override the navigator.webdriver property
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
                
                // Mock plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [
                        {
                            0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
                            description: "Portable Document Format",
                            filename: "internal-pdf-viewer",
                            length: 1,
                            name: "Chrome PDF Plugin"
                        }
                    ]
                });
                
                // Mock languages
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en']
                });
                
                // Mock permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                
                // Mock chrome runtime
                window.chrome = {
                    runtime: {}
                };
                
                // Mock console.debug
                const originalDebug = console.debug;
                console.debug = (...args) => {
                    if (!args[0]?.includes?.('DevTools')) {
                        return originalDebug(...args);
                    }
                };
            });

            // Try to restore session
            await this.restoreSession();
            
            console.log('✅ Etsy Integration initialized');
            return true;
        } catch (error) {
            console.error('Error initializing Etsy Integration:', error);
            return false;
        }
    }

    async restoreSession() {
        try {
            const cookiesString = await fs.readFile(this.cookiesPath, 'utf8');
            const cookies = JSON.parse(cookiesString);
            await this.page.setCookie(...cookies);
            
            // Verify session is still valid
            await this.page.goto('https://www.etsy.com/your/account', { waitUntil: 'networkidle2' });
            const isLoggedIn = await this.checkLoginStatus();
            
            if (isLoggedIn) {
                this.isAuthenticated = true;
                await this.extractShopInfo();
                console.log('✅ Etsy session restored successfully');
            }
        } catch (error) {
            console.log('No previous session found or session expired');
        }
    }

    async login(credentials = null) {
        try {
            // Navigate to login page
            await this.page.goto('https://www.etsy.com/signin', { waitUntil: 'networkidle2' });
            
            // If credentials provided, attempt automated login
            if (credentials && credentials.email && credentials.password) {
                console.log('Attempting automated login with provided credentials...');
                
                try {
                    // Add random delay to seem more human
                    await this.page.waitForTimeout(2000 + Math.random() * 2000);
                    
                    // Wait for email input and enter email with human-like typing
                    await this.page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
                    const emailInput = await this.page.$('input[name="email"], input[type="email"]');
                    await emailInput.click({ clickCount: 3 }); // Triple click to select all
                    await this.page.waitForTimeout(500);
                    await emailInput.type(credentials.email, { delay: 100 + Math.random() * 50 });
                    
                    // Tab to password field like a human would
                    await this.page.waitForTimeout(500 + Math.random() * 500);
                    await this.page.keyboard.press('Tab');
                    
                    // Enter password
                    await this.page.waitForSelector('input[name="password"], input[type="password"]');
                    await this.page.type('input[name="password"], input[type="password"]', credentials.password, { delay: 100 + Math.random() * 50 });
                    
                    // Small delay before clicking button
                    await this.page.waitForTimeout(1000 + Math.random() * 1000);
                    
                    // Click sign in button with mouse movement
                    const button = await this.page.$('button[name="submit_attempt"], button[type="submit"]');
                    const box = await button.boundingBox();
                    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                    await this.page.waitForTimeout(500);
                    await button.click();
                    
                    // Wait for navigation or 2FA
                    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
                    
                    // Check for 2FA
                    const requires2FA = await this.page.$('input[name="code"], input[name="verification_code"]');
                    if (requires2FA) {
                        console.log('2FA required - please enter code in browser window...');
                        // Wait for user to complete 2FA
                        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }).catch(() => {});
                    }
                    
                    // Check if login was successful
                    const isLoggedIn = await this.checkLoginStatus();
                    if (isLoggedIn) {
                        this.isAuthenticated = true;
                        await this.saveSession();
                        await this.extractShopInfo();
                        console.log('✅ Successfully logged in to Etsy!');
                        return true;
                    }
                } catch (error) {
                    console.error('Automated login failed:', error);
                    console.log('Falling back to manual login...');
                }
            }
            
            // Fallback to manual login
            console.log('Please login to Etsy in the browser window...');
            
            // Monitor for successful login
            return new Promise((resolve) => {
                const checkInterval = setInterval(async () => {
                    const isLoggedIn = await this.checkLoginStatus();
                    if (isLoggedIn) {
                        clearInterval(checkInterval);
                        this.isAuthenticated = true;
                        await this.saveSession();
                        await this.extractShopInfo();
                        resolve(true);
                    }
                }, 2000);
                
                // Timeout after 5 minutes
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve(false);
                }, 5 * 60 * 1000);
            });
        } catch (error) {
            console.error('Error during login:', error);
            return false;
        }
    }

    async checkLoginStatus() {
        try {
            const url = await this.page.url();
            if (url.includes('/signin')) return false;
            
            // Check for user menu or shop manager
            return await this.page.evaluate(() => {
                return document.querySelector('[data-user-id]') !== null ||
                       document.querySelector('.shop-manager') !== null ||
                       document.querySelector('[href*="/your/"]') !== null;
            });
        } catch (error) {
            return false;
        }
    }

    async saveSession() {
        try {
            const cookies = await this.page.cookies();
            await fs.writeFile(this.cookiesPath, JSON.stringify(cookies, null, 2));
            console.log('✅ Etsy session saved');
        } catch (error) {
            console.error('Error saving session:', error);
        }
    }

    async extractShopInfo() {
        try {
            await this.page.goto('https://www.etsy.com/your/shops', { waitUntil: 'networkidle2' });
            
            this.shopName = await this.page.evaluate(() => {
                const shopLink = document.querySelector('a[href*="/shop/"]');
                if (shopLink) {
                    const href = shopLink.getAttribute('href');
                    const match = href.match(/\/shop\/([^/?]+)/);
                    return match ? match[1] : null;
                }
                return null;
            });
            
            console.log(`✅ Shop name extracted: ${this.shopName}`);
        } catch (error) {
            console.error('Error extracting shop info:', error);
        }
    }

    async getMessages(onlyUnread = false) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with Etsy');
        }

        try {
            // Navigate to messages
            const messagesUrl = this.shopName ? 
                `https://www.etsy.com/your/shops/${this.shopName}/tools/messages` :
                'https://www.etsy.com/messages';
                
            await this.page.goto(messagesUrl, { waitUntil: 'networkidle2' });
            await this.page.waitForTimeout(2000);

            // Extract messages with improved selectors
            const messages = await this.page.evaluate((filterUnread) => {
                const conversations = [];
                
                // Updated selectors for current Etsy UI
                const messageElements = document.querySelectorAll([
                    '.conversation-card',
                    '[data-convo-thread]',
                    '.message-thread',
                    'tbody tr[data-conversation-id]',
                    '[role="article"][data-conversation]'
                ].join(', '));

                messageElements.forEach(el => {
                    const isUnread = el.classList.contains('is-unread') || 
                                   el.querySelector('.unread-indicator') !== null ||
                                   el.dataset.unread === 'true';
                    
                    if (filterUnread && !isUnread) return;

                    // Extract conversation ID
                    const conversationId = el.dataset.conversationId || 
                                         el.querySelector('[data-conversation-id]')?.dataset.conversationId ||
                                         el.id;

                    // Extract customer name
                    const customerName = el.querySelector('.username, .buyer-name, [data-buyer-username]')?.textContent?.trim() ||
                                       el.querySelector('a[href*="/people/"]')?.textContent?.trim() ||
                                       'Unknown Customer';

                    // Extract message preview
                    const preview = el.querySelector('.last-message, .message-snippet, .conversation-snippet')?.textContent?.trim() ||
                                  el.querySelector('p')?.textContent?.trim() ||
                                  '';

                    // Extract timestamp
                    const timestamp = el.querySelector('time, .timestamp, [data-timestamp]')?.getAttribute('datetime') ||
                                    el.querySelector('.conversation-date')?.textContent?.trim() ||
                                    '';

                    // Check if it contains keywords for quotes
                    const quotesKeywords = ['quote', 'price', 'cost', 'how much', 'custom', '3d print', 'stl', 'file'];
                    const needsQuote = quotesKeywords.some(keyword => 
                        preview.toLowerCase().includes(keyword)
                    );

                    conversations.push({
                        id: conversationId,
                        customerName,
                        preview,
                        isUnread,
                        timestamp,
                        needsQuote,
                        url: window.location.origin + el.querySelector('a[href*="/conversations/"]')?.getAttribute('href')
                    });
                });

                return conversations;
            }, onlyUnread);

            // Update metrics
            const unreadCount = messages.filter(m => m.isUnread).length;
            const quoteRequests = messages.filter(m => m.needsQuote).length;
            
            this.emit('messages-updated', {
                total: messages.length,
                unread: unreadCount,
                quoteRequests
            });

            return messages;
        } catch (error) {
            console.error('Error fetching messages:', error);
            throw error;
        }
    }

    async getMessageDetails(conversationId) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with Etsy');
        }

        try {
            const messageUrl = `https://www.etsy.com/conversations/${conversationId}`;
            await this.page.goto(messageUrl, { waitUntil: 'networkidle2' });
            await this.page.waitForTimeout(2000);

            const details = await this.page.evaluate(() => {
                const messages = [];
                
                // Get all messages in conversation
                const messageElements = document.querySelectorAll('.message, [data-message], .conversation-message');
                
                messageElements.forEach(msg => {
                    const sender = msg.querySelector('.sender-name, .username')?.textContent?.trim();
                    const content = msg.querySelector('.message-content, .message-body')?.textContent?.trim();
                    const timestamp = msg.querySelector('time')?.getAttribute('datetime');
                    const attachments = [];
                    
                    // Check for attachments
                    msg.querySelectorAll('a[href*="/download/"], .attachment').forEach(link => {
                        attachments.push({
                            name: link.textContent?.trim(),
                            url: link.getAttribute('href')
                        });
                    });
                    
                    messages.push({
                        sender,
                        content,
                        timestamp,
                        attachments
                    });
                });

                // Get customer info
                const customerInfo = {
                    name: document.querySelector('.buyer-username, [data-buyer-name]')?.textContent?.trim(),
                    profileUrl: document.querySelector('a[href*="/people/"]')?.getAttribute('href')
                };

                // Get order info if available
                const orderInfo = {
                    orderNumber: document.querySelector('[data-order-id], .order-number')?.textContent?.trim(),
                    orderUrl: document.querySelector('a[href*="/order/"]')?.getAttribute('href')
                };

                return {
                    messages,
                    customerInfo,
                    orderInfo
                };
            });

            return details;
        } catch (error) {
            console.error('Error fetching message details:', error);
            throw error;
        }
    }

    async sendMessage(conversationId, message) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with Etsy');
        }

        try {
            const messageUrl = `https://www.etsy.com/conversations/${conversationId}`;
            await this.page.goto(messageUrl, { waitUntil: 'networkidle2' });
            
            // Find and fill message input
            await this.page.waitForSelector('textarea[name="message"], #message-textarea', { timeout: 5000 });
            await this.page.type('textarea[name="message"], #message-textarea', message, { delay: 50 });
            
            // Send message
            await this.page.click('button[type="submit"], button.send-message');
            await this.page.waitForTimeout(2000);
            
            console.log(`✅ Message sent to conversation ${conversationId}`);
            return true;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    async getOrders(status = 'all') {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with Etsy');
        }

        try {
            const ordersUrl = this.shopName ?
                `https://www.etsy.com/your/shops/${this.shopName}/tools/orders` :
                'https://www.etsy.com/your/orders/sold';
                
            await this.page.goto(ordersUrl, { waitUntil: 'networkidle2' });
            await this.page.waitForTimeout(2000);

            const orders = await this.page.evaluate((filterStatus) => {
                const orderList = [];
                
                // Get order elements
                const orderElements = document.querySelectorAll([
                    '.order-row',
                    '[data-order]',
                    'tr[data-order-id]',
                    '.panel[data-order-id]'
                ].join(', '));

                orderElements.forEach(el => {
                    const orderId = el.dataset.orderId || 
                                  el.querySelector('[data-order-id]')?.dataset.orderId ||
                                  el.querySelector('.order-number')?.textContent?.trim();

                    const buyerName = el.querySelector('.buyer-name, [data-buyer-username]')?.textContent?.trim() ||
                                    el.querySelector('a[href*="/people/"]')?.textContent?.trim();

                    const orderStatus = el.querySelector('.order-status, [data-status]')?.textContent?.trim() ||
                                      el.dataset.status;

                    if (filterStatus !== 'all' && orderStatus !== filterStatus) return;

                    const total = el.querySelector('.order-total, .total-price')?.textContent?.trim();
                    const items = [];
                    
                    // Extract order items
                    el.querySelectorAll('.order-item, .line-item').forEach(item => {
                        items.push({
                            title: item.querySelector('.item-title, .listing-title')?.textContent?.trim(),
                            quantity: item.querySelector('.quantity')?.textContent?.trim() || '1',
                            customization: item.querySelector('.personalization, .customization')?.textContent?.trim()
                        });
                    });

                    const orderDate = el.querySelector('time, .order-date')?.getAttribute('datetime') ||
                                    el.querySelector('.order-date')?.textContent?.trim();

                    // Check for 3D printing related orders
                    const is3DPrint = items.some(item => 
                        item.title?.toLowerCase().includes('3d') ||
                        item.title?.toLowerCase().includes('print') ||
                        item.customization?.toLowerCase().includes('stl') ||
                        item.customization?.toLowerCase().includes('file')
                    );

                    orderList.push({
                        orderId,
                        buyerName,
                        status: orderStatus,
                        total,
                        items,
                        orderDate,
                        is3DPrint,
                        needsProcessing: orderStatus === 'New' || orderStatus === 'Payment confirmed'
                    });
                });

                return orderList;
            }, status);

            // Update metrics
            const newOrders = orders.filter(o => o.needsProcessing).length;
            const printOrders = orders.filter(o => o.is3DPrint).length;
            
            this.emit('orders-updated', {
                total: orders.length,
                new: newOrders,
                printOrders
            });

            return orders;
        } catch (error) {
            console.error('Error fetching orders:', error);
            throw error;
        }
    }

    async markOrderShipped(orderId, trackingNumber = null) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with Etsy');
        }

        try {
            const orderUrl = `https://www.etsy.com/your/orders/sold/${orderId}`;
            await this.page.goto(orderUrl, { waitUntil: 'networkidle2' });
            
            // Click ship button
            await this.page.click('button[data-ship], .mark-shipped-button');
            await this.page.waitForTimeout(1000);
            
            // Add tracking if provided
            if (trackingNumber) {
                await this.page.type('input[name="tracking_number"]', trackingNumber);
            }
            
            // Confirm shipment
            await this.page.click('button[type="submit"], .confirm-ship');
            await this.page.waitForTimeout(2000);
            
            console.log(`✅ Order ${orderId} marked as shipped`);
            return true;
        } catch (error) {
            console.error('Error marking order as shipped:', error);
            throw error;
        }
    }

    startMessagePolling(interval = 60000) {
        if (this.messagePollingInterval) {
            clearInterval(this.messagePollingInterval);
        }

        this.messagePollingInterval = setInterval(async () => {
            try {
                const messages = await this.getMessages(true); // Only unread
                if (messages.length > 0) {
                    this.emit('new-messages', messages);
                }
            } catch (error) {
                console.error('Error polling messages:', error);
            }
        }, interval);

        console.log(`✅ Message polling started (every ${interval/1000} seconds)`);
    }

    startOrderPolling(interval = 120000) {
        if (this.orderPollingInterval) {
            clearInterval(this.orderPollingInterval);
        }

        this.orderPollingInterval = setInterval(async () => {
            try {
                const orders = await this.getOrders('New');
                if (orders.length > 0) {
                    this.emit('new-orders', orders);
                }
            } catch (error) {
                console.error('Error polling orders:', error);
            }
        }, interval);

        console.log(`✅ Order polling started (every ${interval/1000} seconds)`);
    }

    stopPolling() {
        if (this.messagePollingInterval) {
            clearInterval(this.messagePollingInterval);
            this.messagePollingInterval = null;
        }
        if (this.orderPollingInterval) {
            clearInterval(this.orderPollingInterval);
            this.orderPollingInterval = null;
        }
        console.log('Polling stopped');
    }

    async close() {
        this.stopPolling();
        if (this.browser) {
            await this.browser.close();
        }
    }
}

module.exports = EtsyIntegration;