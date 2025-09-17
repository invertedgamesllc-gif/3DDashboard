// Inquiry Management System - Matches inquiries with orders by customer name
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class InquiryManager extends EventEmitter {
    constructor() {
        super();
        this.inquiriesPath = path.join(__dirname, '..', 'data', 'inquiries.json');
        this.ordersPath = path.join(__dirname, '..', 'data', 'orders.json');
        this.matchedPath = path.join(__dirname, '..', 'data', 'matched-orders.json');
        this.inquiries = [];
        this.orders = [];
        this.matchedOrders = [];
        this.initialize();
    }

    async initialize() {
        // Create data directory if it doesn't exist
        const dataDir = path.join(__dirname, '..', 'data');
        await fs.mkdir(dataDir, { recursive: true });
        
        // Load existing data
        await this.loadInquiries();
        await this.loadOrders();
        await this.loadMatchedOrders();
    }

    async loadInquiries() {
        try {
            const data = await fs.readFile(this.inquiriesPath, 'utf8');
            this.inquiries = JSON.parse(data);
        } catch (error) {
            this.inquiries = [];
        }
    }

    async loadOrders() {
        try {
            const data = await fs.readFile(this.ordersPath, 'utf8');
            this.orders = JSON.parse(data);
        } catch (error) {
            this.orders = [];
        }
    }

    async loadMatchedOrders() {
        try {
            const data = await fs.readFile(this.matchedPath, 'utf8');
            this.matchedOrders = JSON.parse(data);
        } catch (error) {
            this.matchedOrders = [];
        }
    }

    async saveInquiries() {
        await fs.writeFile(this.inquiriesPath, JSON.stringify(this.inquiries, null, 2));
    }

    async saveOrders() {
        await fs.writeFile(this.ordersPath, JSON.stringify(this.orders, null, 2));
    }

    async saveMatchedOrders() {
        await fs.writeFile(this.matchedPath, JSON.stringify(this.matchedOrders, null, 2));
    }

    // Add a new inquiry and check for matches
    async addInquiry(inquiry) {
        // Ensure files array is properly structured
        const files = Array.isArray(inquiry.files) ? inquiry.files : [];

        // Log for debugging
        console.log('Adding inquiry with files:', files);

        const newInquiry = {
            id: `INQ-${Date.now()}`,
            customerName: inquiry.customerName,
            customerEmail: inquiry.customerEmail || '',
            message: inquiry.message,
            files: files,
            hasFiles: files.length > 0,  // Add flag for easy checking
            timestamp: new Date().toISOString(),
            status: 'pending',
            source: inquiry.source || 'manual', // 'etsy', 'email', 'manual'
            conversationId: inquiry.conversationId || null
        };

        this.inquiries.push(newInquiry);
        await this.saveInquiries();

        // Check for matching orders
        const matchResult = await this.checkForOrderMatch(newInquiry);
        
        if (matchResult.matched) {
            console.log(`✅ Inquiry matched with order: ${matchResult.order.id}`);
            this.emit('inquiry-matched', {
                inquiry: newInquiry,
                order: matchResult.order,
                confidence: matchResult.confidence
            });
        } else {
            console.log(`⏳ No matching order found for inquiry ${newInquiry.id}`);
            this.emit('inquiry-pending', newInquiry);
        }

        return { inquiry: newInquiry, matchResult };
    }

    // Check if an inquiry matches any recent orders
    async checkForOrderMatch(inquiry) {
        const recentOrders = this.getRecentOrders(7); // Check orders from last 7 days
        
        for (const order of recentOrders) {
            const matchScore = this.calculateMatchScore(inquiry, order);
            
            if (matchScore.confidence >= 0.8) {
                // High confidence match found
                const matchedOrder = await this.convertInquiryToOrder(inquiry, order, matchScore);
                return {
                    matched: true,
                    order: matchedOrder,
                    confidence: matchScore.confidence,
                    matchDetails: matchScore
                };
            }
        }

        return { matched: false };
    }

    // Calculate match score between inquiry and order
    calculateMatchScore(inquiry, order) {
        let score = 0;
        let factors = [];

        // Normalize names for comparison
        const inquiryName = this.normalizeName(inquiry.customerName);
        const orderName = this.normalizeName(order.customerName);

        // Exact name match
        if (inquiryName === orderName) {
            score += 0.5;
            factors.push('exact_name_match');
        } else {
            // Fuzzy name matching
            const nameSimilarity = this.calculateStringSimilarity(inquiryName, orderName);
            if (nameSimilarity > 0.8) {
                score += 0.4;
                factors.push('high_name_similarity');
            } else if (nameSimilarity > 0.6) {
                score += 0.2;
                factors.push('moderate_name_similarity');
            }

            // Check if last name matches
            const inquiryLastName = inquiryName.split(' ').pop();
            const orderLastName = orderName.split(' ').pop();
            if (inquiryLastName === orderLastName && inquiryLastName.length > 2) {
                score += 0.2;
                factors.push('last_name_match');
            }
        }

        // Email match (if available)
        if (inquiry.customerEmail && order.customerEmail) {
            const emailMatch = inquiry.customerEmail.toLowerCase() === order.customerEmail.toLowerCase();
            if (emailMatch) {
                score += 0.3;
                factors.push('email_match');
            }
        }

        // Time proximity (order placed recently before inquiry)
        const inquiryTime = new Date(inquiry.timestamp);
        const orderTime = new Date(order.timestamp);
        const hoursDiff = (inquiryTime - orderTime) / (1000 * 60 * 60);
        
        if (hoursDiff >= 0 && hoursDiff <= 24) {
            score += 0.2;
            factors.push('very_recent_order');
        } else if (hoursDiff > 24 && hoursDiff <= 72) {
            score += 0.1;
            factors.push('recent_order');
        }

        // Check message content for order references
        if (inquiry.message) {
            const message = inquiry.message.toLowerCase();
            if (order.orderNumber && message.includes(order.orderNumber.toLowerCase())) {
                score += 0.3;
                factors.push('order_number_in_message');
            }
            if (order.items && order.items.some(item => 
                message.includes(item.title.toLowerCase().substring(0, 20)))) {
                score += 0.1;
                factors.push('product_mention');
            }
        }

        return {
            confidence: Math.min(score, 1),
            factors: factors,
            nameMatch: this.calculateStringSimilarity(inquiryName, orderName),
            timeDifference: hoursDiff
        };
    }

    // Normalize name for comparison
    normalizeName(name) {
        return name
            .toLowerCase()
            .trim()
            .replace(/[^a-z\s]/g, '') // Remove special characters
            .replace(/\s+/g, ' '); // Normalize spaces
    }

    // Calculate string similarity (Levenshtein distance based)
    calculateStringSimilarity(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = [];

        if (len1 === 0) return len2 === 0 ? 1 : 0;
        if (len2 === 0) return 0;

        for (let i = 0; i <= len2; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= len1; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= len2; i++) {
            for (let j = 1; j <= len1; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        const maxLen = Math.max(len1, len2);
        return 1 - (matrix[len2][len1] / maxLen);
    }

    // Get orders from the last N days
    getRecentOrders(days = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        return this.orders.filter(order => {
            const orderDate = new Date(order.timestamp);
            return orderDate >= cutoffDate && order.status !== 'completed';
        });
    }

    // Convert matched inquiry to order
    async convertInquiryToOrder(inquiry, matchedOrder, matchScore) {
        const enhancedOrder = {
            ...matchedOrder,
            inquiryId: inquiry.id,
            inquiryMessage: inquiry.message,
            inquiryFiles: inquiry.files,
            matchConfidence: matchScore.confidence,
            matchFactors: matchScore.factors,
            mergedAt: new Date().toISOString(),
            status: 'processing'
        };

        // Update inquiry status
        const inquiryIndex = this.inquiries.findIndex(i => i.id === inquiry.id);
        if (inquiryIndex !== -1) {
            this.inquiries[inquiryIndex].status = 'matched';
            this.inquiries[inquiryIndex].matchedOrderId = matchedOrder.id;
            await this.saveInquiries();
        }

        // Update order with inquiry data
        const orderIndex = this.orders.findIndex(o => o.id === matchedOrder.id);
        if (orderIndex !== -1) {
            this.orders[orderIndex] = enhancedOrder;
            await this.saveOrders();
        }

        // Save to matched orders
        this.matchedOrders.push({
            inquiryId: inquiry.id,
            orderId: matchedOrder.id,
            confidence: matchScore.confidence,
            matchedAt: new Date().toISOString()
        });
        await this.saveMatchedOrders();

        return enhancedOrder;
    }

    // Manually match an inquiry with an order
    async manualMatch(inquiryId, orderId) {
        const inquiry = this.inquiries.find(i => i.id === inquiryId);
        const order = this.orders.find(o => o.id === orderId);

        if (!inquiry || !order) {
            throw new Error('Inquiry or order not found');
        }

        const matchScore = {
            confidence: 1.0,
            factors: ['manual_match']
        };

        return await this.convertInquiryToOrder(inquiry, order, matchScore);
    }

    // Get all pending inquiries
    getPendingInquiries() {
        return this.inquiries.filter(i => i.status === 'pending');
    }

    // Get match suggestions for an inquiry
    async getMatchSuggestions(inquiryId) {
        const inquiry = this.inquiries.find(i => i.id === inquiryId);
        if (!inquiry) return [];

        const recentOrders = this.getRecentOrders(14); // Check last 2 weeks
        const suggestions = [];

        for (const order of recentOrders) {
            const matchScore = this.calculateMatchScore(inquiry, order);
            if (matchScore.confidence > 0.3) { // Lower threshold for suggestions
                suggestions.push({
                    order,
                    confidence: matchScore.confidence,
                    factors: matchScore.factors
                });
            }
        }

        return suggestions.sort((a, b) => b.confidence - a.confidence);
    }
}

module.exports = InquiryManager;