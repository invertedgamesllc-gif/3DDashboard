// Etsy Message Automation Script - Fixed Version
// This version includes selector discovery and proper error handling

const puppeteer = require('puppeteer');
const cron = require('node-cron');
require('dotenv').config();

class EtsyAutomation {
    constructor() {
        this.browser = null;
        this.page = null;
        this.credentials = {
            email: process.env.ETSY_EMAIL,
            password: process.env.ETSY_PASSWORD,
            shopName: process.env.ETSY_SHOP_NAME || 'invertedgames'
        };
    }

    async initialize() {
        this.browser = await puppeteer.launch({
            headless: false, // Keep false to see what's happening
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            ],
            defaultViewport: { width: 1366, height: 768 }
        });

        this.page = await this.browser.newPage();
        
        // Prevent detection
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        // Add console logging from the page
        this.page.on('console', msg => {
            if (msg.type() === 'log') {
                console.log('PAGE LOG:', msg.text());
            }
        });
    }

    async login() {
        console.log('🔐 Logging into Etsy...');
        
        await this.page.goto('https://www.etsy.com/signin', { 
            waitUntil: 'networkidle2' 
        });

        await this.page.waitForSelector('input[name="email"]', { timeout: 10000 });
        await this.page.type('input[name="email"]', this.credentials.email, { delay: 100 });

        await this.page.waitForSelector('input[name="password"]');
        await this.page.type('input[name="password"]', this.credentials.password, { delay: 100 });

        await this.page.click('button[name="submit_attempt"]');
        
        await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
        
        const requires2FA = await this.page.$('input[name="code"]');
        if (requires2FA) {
            console.log('📱 2FA Required - Enter code manually in browser');
            await this.page.waitForNavigation({ 
                waitUntil: 'networkidle2',
                timeout: 120000
            });
        }
        
        console.log('✅ Successfully logged in!');
    }

    async discoverSelectors() {
        console.log('🔍 Discovering page selectors...');
        
        // Try to find conversation/message related elements
        const selectors = await this.page.evaluate(() => {
            const found = {};
            
            // Look for conversations
            const possibleConvoSelectors = [
                '[data-convo-list]',
                '[data-conversation-list]',
                '.conversation-list',
                '.convo-list',
                '[class*="conversation"]',
                '[class*="convo"]',
                '[class*="message-list"]',
                '[class*="thread"]',
                '.wt-list-unstyled',
                '[data-appears-component-name*="Message"]',
                '[data-appears-component-name*="Conversation"]'
            ];
            
            for (const selector of possibleConvoSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    found[selector] = elements.length;
                    console.log(`Found ${elements.length} elements with selector: ${selector}`);
                }
            }
            
            // Look for any element with conversation-related text
            const allElements = document.querySelectorAll('*');
            const conversationElements = [];
            
            allElements.forEach(el => {
                const className = el.className || '';
                const id = el.id || '';
                const dataAttrs = Object.keys(el.dataset || {}).join(',');
                
                if (className.includes('conversation') || 
                    className.includes('message') || 
                    className.includes('convo') ||
                    id.includes('conversation') || 
                    id.includes('message') ||
                    dataAttrs.includes('conversation') ||
                    dataAttrs.includes('message')) {
                    
                    conversationElements.push({
                        tag: el.tagName,
                        className: className,
                        id: id,
                        dataAttrs: dataAttrs
                    });
                }
            });
            
            return {
                foundSelectors: found,
                conversationElements: conversationElements.slice(0, 10), // First 10 matches
                pageTitle: document.title,
                url: window.location.href
            };
        });
        
        console.log('📋 Page Info:', selectors);
        return selectors;
    }

    async getMessages() {
        console.log('📬 Fetching messages...');
        
        // Navigate to messages
        const messagesUrl = `https://www.etsy.com/your/shops/${this.credentials.shopName}/tools/messages`;
        console.log(`Navigating to: ${messagesUrl}`);
        
        await this.page.goto(messagesUrl, {
            waitUntil: 'networkidle2'
        });

        // Wait a bit for page to fully load
        await this.page.waitForTimeout(3000);

        // Discover what's actually on the page
        const discovery = await this.discoverSelectors();
        
        // Try multiple possible selectors
        const possibleSelectors = [
            '.conversation-card',
            '[data-conversation-card]',
            '.wt-list-unstyled li',
            '[class*="conversation"]',
            'table tbody tr', // Etsy might use tables
            '.panel-body',
            '[role="list"] [role="listitem"]'
        ];

        let conversations = [];
        
        for (const selector of possibleSelectors) {
            try {
                const elements = await this.page.$$(selector);
                if (elements.length > 0) {
                    console.log(`✅ Found ${elements.length} conversations using selector: ${selector}`);
                    
                    // Extract conversation data
                    conversations = await this.page.evaluate((sel) => {
                        const convos = [];
                        const convoElements = document.querySelectorAll(sel);
                        
                        convoElements.forEach((convo, index) => {
                            // Try to extract any text content
                            const textContent = convo.textContent || '';
                            const links = convo.querySelectorAll('a');
                            const convoLink = links[0]?.href || '';
                            
                            // Look for buyer name (usually in a link or strong tag)
                            const buyerElement = convo.querySelector('a, strong, [class*="username"], [class*="buyer"]');
                            const buyerName = buyerElement?.textContent?.trim() || `Buyer ${index + 1}`;
                            
                            // Look for message preview
                            const messageElement = convo.querySelector('[class*="message"], [class*="text"], p');
                            const lastMessage = messageElement?.textContent?.trim() || textContent.substring(0, 100);
                            
                            // Look for timestamp
                            const timeElement = convo.querySelector('[class*="time"], [class*="date"], time');
                            const timestamp = timeElement?.textContent?.trim() || 'Unknown';
                            
                            // Check for unread indicator
                            const hasUnread = convo.classList.contains('unread') || 
                                            convo.querySelector('[class*="unread"]') !== null ||
                                            textContent.includes('unread');
                            
                            convos.push({
                                id: `convo_${index}`,
                                buyerName,
                                lastMessage: lastMessage.substring(0, 100),
                                timestamp,
                                hasUnread,
                                convoLink
                            });
                        });
                        
                        return convos;
                    }, selector);
                    
                    break; // Found conversations, stop trying other selectors
                }
            } catch (e) {
                console.log(`Selector ${selector} didn't work:`, e.message);
            }
        }

        if (conversations.length === 0) {
            console.log('⚠️ No conversations found. This might mean:');
            console.log('1. You have no messages yet');
            console.log('2. The page structure is different');
            console.log('3. You need to be in Seller mode');
            
            // Take a screenshot for debugging
            await this.page.screenshot({ path: 'messages_page.png' });
            console.log('📸 Screenshot saved as messages_page.png');
            
            // Try to get any relevant page content
            const pageContent = await this.page.evaluate(() => {
                return {
                    title: document.title,
                    url: window.location.href,
                    bodyText: document.body.innerText.substring(0, 500)
                };
            });
            console.log('Page content:', pageContent);
        }

        console.log(`📊 Found ${conversations.length} conversations`);
        return conversations;
    }

    async getNewOrders() {
        console.log('🛍️ Checking for new orders...');
        
        const ordersUrl = `https://www.etsy.com/your/shops/${this.credentials.shopName}/tools/orders`;
        console.log(`Navigating to: ${ordersUrl}`);
        
        await this.page.goto(ordersUrl, {
            waitUntil: 'networkidle2'
        });

        await this.page.waitForTimeout(3000);

        // Try to find orders
        const possibleOrderSelectors = [
            '[data-order]',
            '.order-row',
            'table tbody tr',
            '[class*="order"]',
            '.panel',
            '[role="row"]'
        ];

        let orders = [];

        for (const selector of possibleOrderSelectors) {
            try {
                const elements = await this.page.$$(selector);
                if (elements.length > 0) {
                    console.log(`✅ Found ${elements.length} orders using selector: ${selector}`);
                    
                    orders = await this.page.evaluate((sel) => {
                        const orderList = [];
                        const orderElements = document.querySelectorAll(sel);
                        
                        orderElements.forEach((order, index) => {
                            const textContent = order.textContent || '';
                            
                            // Extract order details from text content
                            const orderId = textContent.match(/#(\d+)/)?.[1] || `order_${index}`;
                            
                            // Look for buyer name
                            const buyerElement = order.querySelector('a[href*="/people/"], [class*="buyer"], [class*="username"]');
                            const buyerName = buyerElement?.textContent?.trim() || 'Unknown Buyer';
                            
                            // Look for item details
                            const itemElement = order.querySelector('a[href*="/listing/"], [class*="title"], [class*="item"]');
                            const itemName = itemElement?.textContent?.trim() || 'Item';
                            
                            // Look for price
                            const priceMatch = textContent.match(/\$[\d,]+\.?\d*/);
                            const price = priceMatch?.[0] || '$0.00';
                            
                            orderList.push({
                                orderId,
                                buyerName,
                                itemName,
                                quantity: 1,
                                price,
                                status: 'new',
                                orderDate: new Date().toISOString()
                            });
                        });
                        
                        return orderList;
                    }, selector);
                    
                    break;
                }
            } catch (e) {
                console.log(`Selector ${selector} didn't work:`, e.message);
            }
        }

        if (orders.length === 0) {
            console.log('⚠️ No orders found. Taking screenshot...');
            await this.page.screenshot({ path: 'orders_page.png' });
            console.log('📸 Screenshot saved as orders_page.png');
        }

        console.log(`📦 Found ${orders.length} orders`);
        return orders;
    }

    async processUnreadMessages() {
        try {
            const conversations = await this.getMessages();
            const unreadConvos = conversations.filter(c => c.hasUnread);
            
            console.log(`📨 Processing ${unreadConvos.length} unread conversations`);
            
            // Process each unread conversation
            for (const convo of unreadConvos) {
                console.log(`Processing conversation with ${convo.buyerName}`);
                // Add your processing logic here
            }
        } catch (error) {
            console.error('Error processing messages:', error);
        }
    }

    async automationLoop() {
        try {
            await this.initialize();
            await this.login();
            
            // Give user time to complete any additional verification
            console.log('⏰ Waiting 5 seconds for page to stabilize...');
            await this.page.waitForTimeout(5000);
            
            // Process messages and orders
            await this.processUnreadMessages();
            const orders = await this.getNewOrders();
            
            // Log what we found
            console.log('✅ Automation cycle complete!');
            console.log(`Found ${orders.length} orders to process`);
            
        } catch (error) {
            console.error('❌ Automation error:', error);
            
            // Take screenshot on error
            try {
                await this.page.screenshot({ path: 'error_screenshot.png' });
                console.log('📸 Error screenshot saved');
            } catch (e) {}
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Main execution
async function main() {
    const automation = new EtsyAutomation();
    
    // Run once
    await automation.automationLoop();
    
    // Keep browser open for 10 seconds for inspection
    console.log('🔍 Keeping browser open for 10 seconds for inspection...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    await automation.close();
    
    console.log('✅ Automation complete!');
}

// Run the automation
main().catch(console.error);