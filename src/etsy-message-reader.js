// Enhanced Etsy Message Reader with Quote Automation
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class EtsyMessageAutomation {
    constructor() {
        this.browser = null;
        this.page = null;
        this.credentials = {
            email: process.env.ETSY_EMAIL,
            password: process.env.ETSY_PASSWORD,
            shopName: process.env.ETSY_SHOP_NAME || 'invertedgames'
        };
        this.messageQueue = [];
        this.printerQueue = [];
    }

    async initialize() {
        console.log('🚀 Initializing browser...');
        this.browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ],
            defaultViewport: { width: 1366, height: 768 }
        });

        this.page = await this.browser.newPage();
        
        // Anti-detection measures
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });

        // Set viewport
        await this.page.setViewport({ width: 1366, height: 768 });
        
        console.log('✅ Browser initialized');
    }

    async login() {
        console.log('🔐 Logging into Etsy...');
        
        try {
            await this.page.goto('https://www.etsy.com/signin', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Wait for and fill email
            await this.page.waitForSelector('input[name="email"], input[id*="email"], input[type="email"]', { timeout: 10000 });
            const emailInput = await this.page.$('input[name="email"], input[id*="email"], input[type="email"]');
            await emailInput.click();
            await emailInput.type(this.credentials.email, { delay: 100 });

            // Fill password
            await this.page.waitForSelector('input[name="password"], input[id*="password"], input[type="password"]');
            const passwordInput = await this.page.$('input[name="password"], input[id*="password"], input[type="password"]');
            await passwordInput.click();
            await passwordInput.type(this.credentials.password, { delay: 100 });

            // Click sign in button
            const signInButton = await this.page.$('button[name="submit_attempt"], button[type="submit"]');
            await signInButton.click();
            
            // Wait for navigation or 2FA
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
            
            // Check for 2FA
            const requires2FA = await this.page.$('input[name="code"], input[id*="code"]');
            if (requires2FA) {
                console.log('📱 2FA Required - Please enter code manually in browser');
                console.log('⏰ Waiting up to 2 minutes for 2FA...');
                await this.page.waitForNavigation({ 
                    waitUntil: 'networkidle2',
                    timeout: 120000
                });
            }
            
            console.log('✅ Successfully logged in!');
            
            // Navigate to shop manager
            await this.navigateToShopManager();
            
        } catch (error) {
            console.error('❌ Login failed:', error.message);
            await this.page.screenshot({ path: 'login_error.png' });
            throw error;
        }
    }

    async navigateToShopManager() {
        console.log('📊 Navigating to Shop Manager...');
        
        // Try multiple navigation methods
        const shopManagerUrls = [
            `https://www.etsy.com/your/shops/${this.credentials.shopName}/tools/listings`,
            `https://www.etsy.com/your/shops/me/dashboard`,
            `https://www.etsy.com/your/account`
        ];

        for (const url of shopManagerUrls) {
            try {
                await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                
                // Check if we're in the shop manager
                const isShopManager = await this.page.evaluate(() => {
                    return document.body.textContent.includes('Shop Manager') || 
                           document.body.textContent.includes('Dashboard') ||
                           document.querySelector('[data-test-id="shop-manager"]') !== null;
                });
                
                if (isShopManager) {
                    console.log('✅ Reached Shop Manager');
                    return;
                }
            } catch (e) {
                console.log(`Could not navigate to ${url}`);
            }
        }
    }

    async getMessages() {
        console.log('📬 Fetching messages...');
        
        try {
            // Navigate to messages - try multiple URLs
            const messageUrls = [
                `https://www.etsy.com/messages?ref=seller-platform-mcnav`,
                `https://www.etsy.com/your/shops/${this.credentials.shopName}/tools/messages`,
                `https://www.etsy.com/conversations`,
                `https://www.etsy.com/your/conversations`
            ];

            let messagesFound = false;
            
            for (const url of messageUrls) {
                console.log(`Trying: ${url}`);
                await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
                
                // Wait for page to load
                await this.page.waitForTimeout(3000);
                
                // Check if we're on messages page
                const onMessagesPage = await this.page.evaluate(() => {
                    return document.body.textContent.includes('Messages') || 
                           document.body.textContent.includes('Conversations') ||
                           document.querySelector('[data-convo-list]') !== null;
                });
                
                if (onMessagesPage) {
                    messagesFound = true;
                    console.log('✅ Found messages page');
                    break;
                }
            }

            if (!messagesFound) {
                console.log('⚠️ Could not find messages page, taking screenshot...');
                await this.page.screenshot({ path: 'messages_page_not_found.png' });
                return [];
            }

            // Try multiple selector strategies
            const conversations = await this.extractConversations();
            
            console.log(`📊 Found ${conversations.length} conversations`);
            return conversations;
            
        } catch (error) {
            console.error('❌ Error fetching messages:', error);
            await this.page.screenshot({ path: 'messages_error.png' });
            return [];
        }
    }

    async extractConversations() {
        // Try multiple extraction methods
        const selectors = [
            // Modern Etsy selectors
            '[data-convo-thread-card]',
            '[data-conversation-card]',
            '.conversation-card',
            
            // Legacy selectors
            '.convo-card',
            '.convo-list-item',
            
            // Table-based layouts
            'table.conversations tbody tr',
            '.conversations-table tr',
            
            // List-based layouts
            '.wt-list-unstyled li[class*="convo"]',
            'ul[class*="conversation"] li',
            '[role="list"] [role="listitem"]',
            
            // Generic message containers
            '[class*="message-thread"]',
            '[class*="conversation-item"]',
            'div[class*="thread-card"]'
        ];

        let conversations = [];

        for (const selector of selectors) {
            try {
                const elements = await this.page.$$(selector);
                if (elements.length > 0) {
                    console.log(`✅ Found ${elements.length} conversations using selector: ${selector}`);
                    
                    conversations = await this.page.evaluate((sel) => {
                        const convos = [];
                        document.querySelectorAll(sel).forEach((element) => {
                            try {
                                // Extract conversation data
                                const text = element.innerText || element.textContent || '';
                                
                                // Try to find customer name
                                const nameElement = element.querySelector('a[href*="/people/"], [class*="username"], strong, h3, h4');
                                const customerName = nameElement?.textContent?.trim() || 'Unknown Customer';
                                
                                // Try to find message preview
                                const messageElement = element.querySelector('[class*="snippet"], [class*="preview"], [class*="message"], p');
                                const messagePreview = messageElement?.textContent?.trim() || text.substring(0, 100);
                                
                                // Check if unread
                                const isUnread = element.classList.toString().includes('unread') ||
                                               element.querySelector('[class*="unread"]') !== null ||
                                               element.querySelector('.wt-text-body-stronger') !== null;
                                
                                // Try to find timestamp
                                const timeElement = element.querySelector('time, [class*="time"], [class*="date"]');
                                const timestamp = timeElement?.textContent?.trim() || 'Recently';
                                
                                // Try to extract conversation link
                                const linkElement = element.querySelector('a[href*="/conversations/"]');
                                const conversationId = linkElement?.href?.match(/conversations\/(\d+)/)?.[1] || null;
                                
                                convos.push({
                                    customerName,
                                    messagePreview: messagePreview.substring(0, 200),
                                    isUnread,
                                    timestamp,
                                    conversationId,
                                    fullText: text.substring(0, 500)
                                });
                            } catch (e) {
                                console.error('Error parsing conversation:', e);
                            }
                        });
                        return convos;
                    }, selector);
                    
                    break;
                }
            } catch (e) {
                // Continue to next selector
            }
        }

        // If no conversations found with selectors, try to extract from page content
        if (conversations.length === 0) {
            console.log('⚠️ No conversations found with selectors, attempting text extraction...');
            
            const pageContent = await this.page.evaluate(() => {
                const content = document.body.innerText;
                const hasMessages = content.includes('message') || content.includes('conversation');
                return {
                    hasMessages,
                    preview: content.substring(0, 1000)
                };
            });
            
            console.log('Page content preview:', pageContent.preview);
        }

        return conversations;
    }

    async readConversation(conversationId) {
        console.log(`📖 Reading conversation ${conversationId}...`);
        
        try {
            // Navigate to specific conversation
            const conversationUrl = `https://www.etsy.com/your/shops/${this.credentials.shopName}/tools/messages/${conversationId}`;
            await this.page.goto(conversationUrl, { waitUntil: 'networkidle2' });
            
            // Wait for messages to load
            await this.page.waitForTimeout(2000);
            
            // Extract all messages in the conversation
            const messages = await this.page.evaluate(() => {
                const messageElements = document.querySelectorAll('[class*="message"], [class*="chat-bubble"], [class*="convo-message"]');
                const msgs = [];
                
                messageElements.forEach(element => {
                    const text = element.textContent?.trim();
                    const isSeller = element.classList.toString().includes('seller') || 
                                   element.classList.toString().includes('sent');
                    
                    if (text) {
                        msgs.push({
                            text,
                            isSeller,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
                
                return msgs;
            });
            
            return messages;
            
        } catch (error) {
            console.error(`Error reading conversation ${conversationId}:`, error);
            return [];
        }
    }

    parseQuoteRequest(messageText) {
        console.log('🔍 Parsing message for quote request...');
        
        const quoteIndicators = [
            'how much',
            'price',
            'cost',
            'quote',
            'estimate',
            'print this',
            'can you make',
            'custom',
            '3d print'
        ];
        
        const isQuoteRequest = quoteIndicators.some(indicator => 
            messageText.toLowerCase().includes(indicator)
        );
        
        if (!isQuoteRequest) {
            return null;
        }
        
        // Extract details from message
        const details = {
            isQuoteRequest: true,
            hasSTLFile: messageText.toLowerCase().includes('.stl') || messageText.toLowerCase().includes('file'),
            quantity: this.extractQuantity(messageText),
            material: this.extractMaterial(messageText),
            size: this.extractSize(messageText),
            urgency: this.extractUrgency(messageText),
            customRequirements: []
        };
        
        // Extract custom requirements
        if (messageText.toLowerCase().includes('color')) {
            details.customRequirements.push('specific color requested');
        }
        if (messageText.toLowerCase().includes('smooth') || messageText.toLowerCase().includes('finish')) {
            details.customRequirements.push('post-processing required');
        }
        if (messageText.toLowerCase().includes('strong') || messageText.toLowerCase().includes('durable')) {
            details.customRequirements.push('high strength material needed');
        }
        
        return details;
    }

    extractQuantity(text) {
        const quantityMatch = text.match(/(\d+)\s*(pieces?|units?|items?|x\s|copies)/i);
        return quantityMatch ? parseInt(quantityMatch[1]) : 1;
    }

    extractMaterial(text) {
        const materials = {
            'pla': 'PLA',
            'abs': 'ABS',
            'petg': 'PETG',
            'tpu': 'TPU',
            'nylon': 'Nylon',
            'resin': 'Resin'
        };
        
        for (const [key, value] of Object.entries(materials)) {
            if (text.toLowerCase().includes(key)) {
                return value;
            }
        }
        return 'PLA'; // Default
    }

    extractSize(text) {
        const sizeMatch = text.match(/(\d+)\s*(mm|cm|inch|inches|")/i);
        if (sizeMatch) {
            const value = parseInt(sizeMatch[1]);
            const unit = sizeMatch[2];
            return { value, unit };
        }
        return null;
    }

    extractUrgency(text) {
        const urgentKeywords = ['urgent', 'asap', 'rush', 'quickly', 'fast', 'tomorrow', 'weekend'];
        return urgentKeywords.some(keyword => text.toLowerCase().includes(keyword));
    }

    async generateQuote(quoteRequest) {
        console.log('💰 Generating quote...');
        
        // Base pricing
        const materialCosts = {
            'PLA': 0.03,     // per gram
            'ABS': 0.035,
            'PETG': 0.04,
            'TPU': 0.06,
            'Nylon': 0.08,
            'Resin': 0.10
        };
        
        const material = quoteRequest.material || 'PLA';
        const quantity = quoteRequest.quantity || 1;
        
        // Estimate weight and time (would be calculated from actual STL file in production)
        const estimatedWeight = 50; // grams (placeholder)
        const estimatedPrintTime = 3; // hours (placeholder)
        
        // Calculate costs
        const materialCost = estimatedWeight * materialCosts[material];
        const machineCost = estimatedPrintTime * 2.50; // $2.50 per hour
        const laborCost = 0.5 * 25; // 30 minutes labor at $25/hour
        
        let subtotal = (materialCost + machineCost + laborCost) * quantity;
        
        // Add urgency fee if needed
        if (quoteRequest.urgency) {
            subtotal *= 1.5; // 50% rush fee
        }
        
        // Add margin
        const total = subtotal * 1.4; // 40% margin
        
        return {
            material,
            quantity,
            estimatedWeight,
            estimatedPrintTime,
            materialCost: materialCost.toFixed(2),
            machineCost: machineCost.toFixed(2),
            laborCost: laborCost.toFixed(2),
            rushFee: quoteRequest.urgency ? (subtotal * 0.5).toFixed(2) : '0.00',
            total: total.toFixed(2),
            deliveryTime: quoteRequest.urgency ? '2-3 days' : '5-7 days'
        };
    }

    async sendReply(conversationId, message) {
        console.log(`📤 Sending reply to conversation ${conversationId}...`);
        
        try {
            // Navigate to conversation
            const conversationUrl = `https://www.etsy.com/your/shops/${this.credentials.shopName}/tools/messages/${conversationId}`;
            await this.page.goto(conversationUrl, { waitUntil: 'networkidle2' });
            
            // Find message input
            const messageInput = await this.page.$('textarea[name="message"], textarea[placeholder*="Type"], [contenteditable="true"]');
            
            if (messageInput) {
                await messageInput.click();
                await messageInput.type(message, { delay: 50 });
                
                // Find and click send button
                const sendButton = await this.page.$('button[type="submit"], button[aria-label*="Send"], button:has-text("Send")');
                if (sendButton) {
                    await sendButton.click();
                    console.log('✅ Reply sent successfully');
                    return true;
                }
            }
            
            console.log('⚠️ Could not find message input or send button');
            return false;
            
        } catch (error) {
            console.error('Error sending reply:', error);
            return false;
        }
    }

    formatQuoteMessage(quote, customerName) {
        return `Hi ${customerName},

Thank you for your interest in our 3D printing services!

Based on your request, here's a quote for your project:

📦 **Order Details:**
- Material: ${quote.material}
- Quantity: ${quote.quantity} piece(s)
- Estimated Weight: ${quote.estimatedWeight}g per piece
- Print Time: ${quote.estimatedPrintTime} hours per piece

💰 **Pricing Breakdown:**
- Material Cost: $${quote.materialCost}
- Machine Time: $${quote.machineCost}
- Labor & Setup: $${quote.laborCost}
${quote.rushFee !== '0.00' ? `- Rush Processing: $${quote.rushFee}` : ''}

**Total: $${quote.total}**

⏰ **Delivery Time:** ${quote.deliveryTime}

To proceed with your order:
1. Please send us your STL/3D file if you haven't already
2. Confirm the material and color choice
3. Let us know if you need any modifications

We're here to help make your project a success! Feel free to ask any questions.

Best regards,
${this.credentials.shopName}`;
    }

    async processUnreadMessages() {
        console.log('🔄 Processing unread messages...');
        
        const conversations = await this.getMessages();
        const unreadConversations = conversations.filter(c => c.isUnread);
        
        console.log(`📨 Found ${unreadConversations.length} unread conversations`);
        
        for (const conversation of unreadConversations) {
            console.log(`\n Processing conversation with ${conversation.customerName}`);
            
            // Check if this is a quote request
            const quoteRequest = this.parseQuoteRequest(conversation.fullText || conversation.messagePreview);
            
            if (quoteRequest) {
                console.log('💡 Quote request detected!');
                
                // Generate quote
                const quote = await this.generateQuote(quoteRequest);
                
                // Format reply message
                const replyMessage = this.formatQuoteMessage(quote, conversation.customerName);
                
                console.log('Generated quote:', quote);
                
                // Send reply (if conversation ID is available)
                if (conversation.conversationId) {
                    await this.sendReply(conversation.conversationId, replyMessage);
                    
                    // Add to printer queue if approved
                    this.printerQueue.push({
                        customer: conversation.customerName,
                        material: quote.material,
                        quantity: quote.quantity,
                        estimatedTime: quote.estimatedPrintTime,
                        priority: quoteRequest.urgency ? 'high' : 'normal',
                        status: 'quoted',
                        timestamp: new Date().toISOString()
                    });
                } else {
                    console.log('⚠️ No conversation ID available for reply');
                    console.log('Quote message prepared:', replyMessage);
                }
                
                // Save quote for records
                await this.saveQuote(conversation.customerName, quote);
            } else {
                console.log('ℹ️ Not a quote request, skipping auto-reply');
            }
            
            // Add small delay between processing conversations
            await this.page.waitForTimeout(2000);
        }
        
        // Save printer queue
        await this.savePrinterQueue();
    }

    async saveQuote(customerName, quote) {
        const quotesDir = path.join(__dirname, 'quotes');
        await fs.mkdir(quotesDir, { recursive: true });
        
        const filename = `quote_${Date.now()}_${customerName.replace(/[^a-z0-9]/gi, '_')}.json`;
        const filepath = path.join(quotesDir, filename);
        
        await fs.writeFile(filepath, JSON.stringify({
            customerName,
            quote,
            timestamp: new Date().toISOString()
        }, null, 2));
        
        console.log(`💾 Quote saved to ${filename}`);
    }

    async savePrinterQueue() {
        const queuePath = path.join(__dirname, 'printer_queue.json');
        await fs.writeFile(queuePath, JSON.stringify(this.printerQueue, null, 2));
        console.log(`💾 Printer queue saved (${this.printerQueue.length} items)`);
    }

    async runAutomation() {
        try {
            await this.initialize();
            await this.login();
            
            console.log('\n🔄 Starting message automation loop...');
            
            // Process messages immediately
            await this.processUnreadMessages();
            
            // Set up periodic checking (every 5 minutes)
            console.log('\n⏰ Setting up auto-check every 5 minutes...');
            setInterval(async () => {
                console.log('\n🔄 Running scheduled check...');
                await this.processUnreadMessages();
            }, 5 * 60 * 1000); // 5 minutes
            
            console.log('✅ Automation is running! Press Ctrl+C to stop.');
            
        } catch (error) {
            console.error('❌ Automation error:', error);
            await this.cleanup();
        }
    }

    async cleanup() {
        console.log('🧹 Cleaning up...');
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Main execution
async function main() {
    const automation = new EtsyMessageAutomation();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n👋 Shutting down gracefully...');
        await automation.cleanup();
        process.exit(0);
    });
    
    // Run the automation
    await automation.runAutomation();
}

// Start the automation
if (require.main === module) {
    main().catch(console.error);
}

module.exports = EtsyMessageAutomation;