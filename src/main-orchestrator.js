// Main Orchestrator - Ties together Etsy messages and Bambu printer queue
const EtsyMessageAutomation = require('./etsy-message-reader');
const BambuPrinterManager = require('./bambu-integration');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

class Print3DBusinessAutomation {
    constructor() {
        this.etsyAutomation = new EtsyMessageAutomation();
        this.printerManager = new BambuPrinterManager();
        this.ordersPath = path.join(__dirname, 'orders.json');
        this.orders = [];
    }

    async initialize() {
        console.log('🚀 Initializing 3D Print Business Automation System...');
        console.log('================================================\n');
        
        // Initialize printer manager
        await this.printerManager.initialize();
        
        // Load existing orders
        await this.loadOrders();
        
        console.log('✅ System initialized successfully!\n');
    }

    async loadOrders() {
        try {
            const ordersData = await fs.readFile(this.ordersPath, 'utf8');
            this.orders = JSON.parse(ordersData);
            console.log(`📋 Loaded ${this.orders.length} existing orders`);
        } catch (error) {
            console.log('📋 No existing orders found');
            this.orders = [];
        }
    }

    async saveOrders() {
        await fs.writeFile(this.ordersPath, JSON.stringify(this.orders, null, 2));
    }

    async startEtsyMonitoring() {
        console.log('🔍 Starting Etsy message monitoring...');
        
        try {
            // Initialize Etsy automation
            await this.etsyAutomation.initialize();
            await this.etsyAutomation.login();
            
            // Override the processUnreadMessages to integrate with printer queue
            this.etsyAutomation.processUnreadMessages = async () => {
                console.log('🔄 Checking for new Etsy messages...');
                
                const conversations = await this.etsyAutomation.getMessages();
                const unreadConversations = conversations.filter(c => c.isUnread);
                
                console.log(`📨 Found ${unreadConversations.length} unread conversations`);
                
                for (const conversation of unreadConversations) {
                    await this.processConversation(conversation);
                }
            };
            
            // Run initial check
            await this.etsyAutomation.processUnreadMessages();
            
            console.log('✅ Etsy monitoring active\n');
            
        } catch (error) {
            console.error('❌ Error starting Etsy monitoring:', error);
            console.log('⚠️ Continuing with printer management only\n');
        }
    }

    async processConversation(conversation) {
        console.log(`\n📬 Processing message from ${conversation.customerName}`);
        
        const quoteRequest = this.etsyAutomation.parseQuoteRequest(
            conversation.fullText || conversation.messagePreview
        );
        
        if (quoteRequest) {
            console.log('💡 Quote request detected!');
            
            // Generate quote
            const quote = await this.etsyAutomation.generateQuote(quoteRequest);
            
            // Create order record
            const order = {
                id: `ORD_${Date.now()}`,
                customer: conversation.customerName,
                conversationId: conversation.conversationId,
                quoteRequest: quoteRequest,
                quote: quote,
                status: 'quoted',
                createdAt: new Date().toISOString()
            };
            
            this.orders.push(order);
            await this.saveOrders();
            
            // Format and send reply
            const replyMessage = this.etsyAutomation.formatQuoteMessage(quote, conversation.customerName);
            
            if (conversation.conversationId) {
                const sent = await this.etsyAutomation.sendReply(conversation.conversationId, replyMessage);
                
                if (sent) {
                    console.log('✅ Quote sent to customer');
                    order.quoteSentAt = new Date().toISOString();
                } else {
                    console.log('⚠️ Could not send quote automatically');
                    console.log('📋 Quote saved for manual sending:');
                    console.log(replyMessage);
                }
            }
            
            // If high priority, pre-add to printer queue
            if (quoteRequest.urgency) {
                console.log('🚨 High priority order - pre-adding to queue');
                await this.addToPrinterQueue(order, 'high');
            }
            
        } else {
            console.log('ℹ️ Not a quote request');
            
            // Check if it's an order confirmation
            if (this.isOrderConfirmation(conversation.messagePreview)) {
                await this.processOrderConfirmation(conversation);
            }
        }
    }

    isOrderConfirmation(messageText) {
        const confirmationKeywords = [
            'yes', 'approve', 'confirmed', 'go ahead', 'proceed',
            'looks good', 'perfect', 'accept', 'order this'
        ];
        
        const text = messageText.toLowerCase();
        return confirmationKeywords.some(keyword => text.includes(keyword));
    }

    async processOrderConfirmation(conversation) {
        console.log('✅ Order confirmation detected!');
        
        // Find the most recent quote for this customer
        const recentOrder = this.orders
            .filter(o => o.customer === conversation.customerName && o.status === 'quoted')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        
        if (recentOrder) {
            console.log(`📦 Confirming order ${recentOrder.id}`);
            
            // Update order status
            recentOrder.status = 'confirmed';
            recentOrder.confirmedAt = new Date().toISOString();
            await this.saveOrders();
            
            // Add to printer queue
            await this.addToPrinterQueue(recentOrder, recentOrder.quoteRequest?.urgency ? 'high' : 'normal');
            
            // Send confirmation message
            const confirmationMessage = `Thank you for confirming your order!

Your order #${recentOrder.id} has been added to our production queue.

Estimated completion: ${recentOrder.quote.deliveryTime}

We'll notify you when printing begins and when your order is ready for shipping.

You can track your order status at any time by messaging us with your order number.`;
            
            if (conversation.conversationId) {
                await this.etsyAutomation.sendReply(conversation.conversationId, confirmationMessage);
            }
        }
    }

    async addToPrinterQueue(order, priority = 'normal') {
        const printJob = {
            customer: order.customer,
            orderNumber: order.id,
            fileName: `${order.id}.3mf`, // Would be actual file in production
            material: order.quote.material,
            quantity: order.quote.quantity,
            estimatedTime: order.quote.estimatedPrintTime,
            priority: priority,
            notes: order.quoteRequest?.customRequirements?.join(', ') || ''
        };
        
        const queueItem = await this.printerManager.addToQueue(printJob);
        
        // Update order with queue information
        order.queueId = queueItem.id;
        order.queuedAt = new Date().toISOString();
        await this.saveOrders();
        
        console.log(`✅ Order ${order.id} added to printer queue as ${queueItem.id}`);
    }

    async setupScheduledTasks() {
        console.log('⏰ Setting up scheduled tasks...');
        
        // Check Etsy messages every 5 minutes
        cron.schedule('*/5 * * * *', async () => {
            console.log('\n⏰ Running scheduled Etsy check...');
            if (this.etsyAutomation.page) {
                await this.etsyAutomation.processUnreadMessages();
            }
        });
        
        // Update printer status every minute
        cron.schedule('* * * * *', async () => {
            for (const printer of this.printerManager.printers) {
                if (printer.connected) {
                    await this.printerManager.updatePrinterStatus(printer);
                }
            }
            await this.printerManager.assignJobsToPrinters();
        });
        
        // Daily report at 9 AM
        cron.schedule('0 9 * * *', async () => {
            await this.generateDailyReport();
        });
        
        console.log('✅ Scheduled tasks configured\n');
    }

    async generateDailyReport() {
        console.log('\n📊 Generating Daily Report...');
        
        const today = new Date().toDateString();
        const todayOrders = this.orders.filter(o => 
            new Date(o.createdAt).toDateString() === today
        );
        
        const status = await this.printerManager.getQueueStatus();
        
        const report = {
            date: today,
            newOrders: todayOrders.length,
            quotedOrders: todayOrders.filter(o => o.status === 'quoted').length,
            confirmedOrders: todayOrders.filter(o => o.status === 'confirmed').length,
            completedJobs: status.completedToday,
            printersOnline: status.printers.filter(p => p.connected).length,
            queueLength: status.queue.total,
            estimatedQueueTime: status.estimatedQueueTime,
            revenue: todayOrders
                .filter(o => o.status === 'confirmed')
                .reduce((sum, o) => sum + parseFloat(o.quote?.total || 0), 0)
                .toFixed(2)
        };
        
        console.log('📊 Daily Report:', JSON.stringify(report, null, 2));
        
        // Save report
        const reportsDir = path.join(__dirname, 'reports');
        await fs.mkdir(reportsDir, { recursive: true });
        const reportPath = path.join(reportsDir, `report_${today.replace(/\s/g, '_')}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        return report;
    }

    async getSystemStatus() {
        const printerStatus = await this.printerManager.getQueueStatus();
        const pendingQuotes = this.orders.filter(o => o.status === 'quoted').length;
        const activeOrders = this.orders.filter(o => o.status === 'confirmed').length;
        
        return {
            etsy: {
                connected: !!this.etsyAutomation.page,
                lastCheck: new Date().toISOString()
            },
            printers: printerStatus,
            orders: {
                pendingQuotes,
                activeOrders,
                totalToday: this.orders.filter(o => 
                    new Date(o.createdAt).toDateString() === new Date().toDateString()
                ).length
            }
        };
    }

    async start() {
        console.log(`
╔══════════════════════════════════════════════════╗
║     3D PRINT BUSINESS AUTOMATION SYSTEM         ║
║           Etsy + Bambu Integration               ║
╚══════════════════════════════════════════════════╝
`);
        
        // Initialize system
        await this.initialize();
        
        // Start Etsy monitoring
        await this.startEtsyMonitoring();
        
        // Setup scheduled tasks
        await this.setupScheduledTasks();
        
        // Start status display
        this.startStatusDisplay();
        
        console.log(`
✅ All systems operational!
   
Commands:
- Press 's' for system status
- Press 'q' to view printer queue
- Press 'r' for daily report
- Press Ctrl+C to shutdown

Monitoring Etsy messages every 5 minutes...
`);
    }

    startStatusDisplay() {
        // Update console with status every 30 seconds
        setInterval(async () => {
            const status = await this.getSystemStatus();
            
            process.stdout.write('\x1Bc'); // Clear console
            console.log(`
╔══════════════════════════════════════════════════╗
║     3D PRINT AUTOMATION - LIVE STATUS           ║
╚══════════════════════════════════════════════════╝

🌐 ETSY CONNECTION: ${status.etsy.connected ? '✅ Connected' : '❌ Disconnected'}
   Last Check: ${new Date(status.etsy.lastCheck).toLocaleTimeString()}

🖨️ PRINTERS (${status.printers.printers.filter(p => p.connected).length}/${status.printers.printers.length} online):
${status.printers.printers.map(p => 
    `   ${p.connected ? '🟢' : '🔴'} ${p.name}: ${p.status}${
        p.currentJob ? ` (${p.currentJob.customer} - ${p.currentJob.progress?.toFixed(0) || 0}%)` : ''
    }`
).join('\n')}

📦 ORDERS:
   Pending Quotes: ${status.orders.pendingQuotes}
   Active Orders: ${status.orders.activeOrders}
   Today's Total: ${status.orders.totalToday}

📊 QUEUE:
   Waiting: ${status.printers.queue.queued}
   Printing: ${status.printers.queue.printing}
   High Priority: ${status.printers.queue.highPriority}
   Est. Time: ${status.printers.estimatedQueueTime}

⏰ Next Etsy check in: ${this.getTimeUntilNextCheck()}
`);
        }, 30000);
    }

    getTimeUntilNextCheck() {
        const now = new Date();
        const minutes = now.getMinutes();
        const nextCheck = 5 - (minutes % 5);
        return `${nextCheck} min`;
    }

    async shutdown() {
        console.log('\n🛑 Shutting down gracefully...');
        
        // Save all data
        await this.saveOrders();
        await this.printerManager.saveQueue();
        
        // Close Etsy browser
        if (this.etsyAutomation.browser) {
            await this.etsyAutomation.cleanup();
        }
        
        console.log('✅ Shutdown complete. Goodbye!');
        process.exit(0);
    }
}

// Main execution
async function main() {
    const automation = new Print3DBusinessAutomation();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        await automation.shutdown();
    });
    
    // Handle keyboard input
    process.stdin.setRawMode(true);
    process.stdin.on('data', async (key) => {
        const keyStr = key.toString();
        
        if (keyStr === 's') {
            const status = await automation.getSystemStatus();
            console.log('\n📊 System Status:', JSON.stringify(status, null, 2));
        } else if (keyStr === 'q') {
            const queue = await automation.printerManager.getQueueStatus();
            console.log('\n🖨️ Printer Queue:', JSON.stringify(queue, null, 2));
        } else if (keyStr === 'r') {
            await automation.generateDailyReport();
        } else if (keyStr === '\u0003') { // Ctrl+C
            await automation.shutdown();
        }
    });
    
    // Start the automation
    await automation.start();
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = Print3DBusinessAutomation;