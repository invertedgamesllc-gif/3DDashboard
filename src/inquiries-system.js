// Inquiries System Module - Handles all inquiry management and downloads
class InquiriesSystem {
    constructor() {
        this.inquiries = [];
        this.initialize();
    }

    async initialize() {
        await this.loadInquiries();
        this.setupEventListeners();
        this.renderInquiries();
    }

    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshInquiries');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadInquiries());
        }

        // Search functionality
        const searchInput = document.getElementById('inquirySearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.searchInquiries(e.target.value));
        }
    }

    async loadInquiries() {
        try {
            // Load from server
            const response = await fetch('/api/inquiries');
            if (response.ok) {
                const data = await response.json();
                this.inquiries = data.inquiries || [];
                console.log(`Loaded ${this.inquiries.length} inquiries from server`);
            }
        } catch (error) {
            console.error('Error loading inquiries:', error);
            // Fall back to localStorage if server fails
            this.inquiries = JSON.parse(localStorage.getItem('inquiries') || '[]');
        }

        this.renderInquiries();
    }

    renderInquiries() {
        const container = document.getElementById('inquiriesTableBody');
        if (!container) return;

        if (this.inquiries.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 20px; color: var(--text-muted);">
                        No inquiries yet. Create one from the Quote Calculator.
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = this.inquiries.map(inquiry => {
            const hasFiles = inquiry.files && inquiry.files.length > 0;
            const quote = inquiry.quote || inquiry;
            const totalQuote = quote.subtotal || quote.totalQuote || 0;

            return `
                <tr>
                    <td>${this.formatDate(inquiry.createdAt || inquiry.timestamp || inquiry.date)}</td>
                    <td>${inquiry.customerName || 'N/A'}</td>
                    <td>${inquiry.customerEmail || 'N/A'}</td>
                    <td>${quote.materialWeight || 0}g / ${quote.printTime || 0}h</td>
                    <td>$${this.formatPrice(totalQuote)}</td>
                    <td>
                        <span class="status-badge status-${inquiry.status || 'pending'}">
                            ${inquiry.status || 'pending'}
                        </span>
                    </td>
                    <td>
                        ${hasFiles ? `
                            <button onclick="inquiriesSystem.downloadFiles('${inquiry.id}')" class="btn btn-small">
                                📥 Download (${inquiry.files.length})
                            </button>
                        ` : '<span style="color: var(--text-muted);">No files</span>'}
                    </td>
                    <td>
                        <button onclick="inquiriesSystem.viewDetails('${inquiry.id}')" class="btn btn-small">
                            👁️ View
                        </button>
                        <button onclick="inquiriesSystem.deleteInquiry('${inquiry.id}')" class="btn btn-small btn-danger">
                            🗑️
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        this.updateStats();
    }

    async downloadFiles(inquiryId) {
        const inquiry = this.inquiries.find(i => String(i.id) === String(inquiryId));
        if (!inquiry) {
            this.showNotification('Inquiry not found', 'error');
            return;
        }

        if (!inquiry.files || inquiry.files.length === 0) {
            this.showNotification('No files attached to this inquiry', 'warning');
            return;
        }

        console.log(`Downloading files for inquiry ${inquiryId}:`, inquiry.files);

        // Download each file
        for (const file of inquiry.files) {
            try {
                if (file.serverFilename) {
                    // Download from server
                    const response = await fetch(`/api/download-inquiry-file/${file.serverFilename}`);
                    if (response.ok) {
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = file.name || file.serverFilename;
                        a.click();
                        URL.revokeObjectURL(url);
                    } else {
                        throw new Error('Download failed');
                    }
                } else {
                    console.warn('No server filename for file:', file);
                }
            } catch (error) {
                console.error(`Error downloading ${file.name}:`, error);
                this.showNotification(`Failed to download ${file.name}`, 'error');
            }
        }
    }

    viewDetails(inquiryId) {
        const inquiry = this.inquiries.find(i => String(i.id) === String(inquiryId));
        if (!inquiry) return;

        const quote = inquiry.quote || inquiry;
        const details = `
            <div style="padding: 20px;">
                <h3>Inquiry Details</h3>
                <div style="display: grid; gap: 15px; margin-top: 20px;">
                    <div>
                        <strong>Customer:</strong> ${inquiry.customerName} (${inquiry.customerEmail})
                    </div>
                    <div>
                        <strong>Date:</strong> ${this.formatDate(inquiry.createdAt || inquiry.timestamp)}
                    </div>
                    <div>
                        <strong>Project:</strong> ${inquiry.projectDescription || 'No description'}
                    </div>
                    <div>
                        <strong>Material:</strong> ${quote.materialType || 'PLA'} - ${quote.materialWeight || 0}g
                    </div>
                    <div>
                        <strong>Print Time:</strong> ${quote.printTime || 0} hours
                    </div>
                    <div>
                        <strong>Total Quote:</strong> $${this.formatPrice(quote.subtotal || quote.totalQuote || 0)}
                    </div>
                    <div>
                        <strong>Files:</strong> ${inquiry.files?.length || 0} attached
                        ${inquiry.files?.map(f => `<br>• ${f.name}`).join('') || ''}
                    </div>
                </div>
                <div style="margin-top: 20px; display: flex; gap: 10px;">
                    <button onclick="inquiriesSystem.convertToOrder('${inquiryId}')" class="btn">
                        Convert to Order
                    </button>
                    <button onclick="inquiriesSystem.sendQuoteEmail('${inquiryId}')" class="btn">
                        Send Quote Email
                    </button>
                    <button onclick="closeModal()" class="btn btn-secondary">
                        Close
                    </button>
                </div>
            </div>
        `;

        // Show in modal or alert
        if (typeof showModal === 'function') {
            showModal(details);
        } else {
            alert('Inquiry Details:\n' + JSON.stringify(inquiry, null, 2));
        }
    }

    async deleteInquiry(inquiryId) {
        if (!confirm('Are you sure you want to delete this inquiry?')) return;

        try {
            const response = await fetch(`/api/inquiries/${inquiryId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.inquiries = this.inquiries.filter(i => String(i.id) !== String(inquiryId));
                this.renderInquiries();
                this.showNotification('Inquiry deleted', 'success');
            } else {
                throw new Error('Delete failed');
            }
        } catch (error) {
            console.error('Delete error:', error);
            // Remove locally
            this.inquiries = this.inquiries.filter(i => String(i.id) !== String(inquiryId));
            localStorage.setItem('inquiries', JSON.stringify(this.inquiries));
            this.renderInquiries();
        }
    }

    searchInquiries(searchTerm) {
        if (!searchTerm) {
            this.renderInquiries();
            return;
        }

        const filtered = this.inquiries.filter(inquiry => {
            const search = searchTerm.toLowerCase();
            return (
                inquiry.customerName?.toLowerCase().includes(search) ||
                inquiry.customerEmail?.toLowerCase().includes(search) ||
                inquiry.projectDescription?.toLowerCase().includes(search)
            );
        });

        this.renderFilteredInquiries(filtered);
    }

    renderFilteredInquiries(inquiries) {
        const container = document.getElementById('inquiriesTableBody');
        if (!container) return;

        if (inquiries.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 20px; color: var(--text-muted);">
                        No inquiries match your search.
                    </td>
                </tr>
            `;
            return;
        }

        // Use same rendering logic as renderInquiries but with filtered list
        const temp = this.inquiries;
        this.inquiries = inquiries;
        this.renderInquiries();
        this.inquiries = temp;
    }

    updateStats() {
        // Update statistics
        const totalInquiries = this.inquiries.length;
        const pendingCount = this.inquiries.filter(i => i.status === 'pending').length;
        const totalValue = this.inquiries.reduce((sum, i) => {
            const quote = i.quote || i;
            return sum + (quote.subtotal || quote.totalQuote || 0);
        }, 0);

        // Update UI elements if they exist
        const statsElement = document.getElementById('inquiryStats');
        if (statsElement) {
            statsElement.innerHTML = `
                <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <strong>Total Inquiries:</strong> ${totalInquiries}
                    </div>
                    <div>
                        <strong>Pending:</strong> ${pendingCount}
                    </div>
                    <div>
                        <strong>Total Value:</strong> $${this.formatPrice(totalValue)}
                    </div>
                </div>
            `;
        }
    }

    async convertToOrder(inquiryId) {
        const inquiry = this.inquiries.find(i => String(i.id) === String(inquiryId));
        if (!inquiry) return;

        try {
            const response = await fetch('/api/convert-inquiry-to-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inquiryId })
            });

            if (response.ok) {
                const result = await response.json();
                this.showNotification('Inquiry converted to order', 'success');

                // Update status
                inquiry.status = 'converted';
                this.renderInquiries();
            }
        } catch (error) {
            console.error('Convert error:', error);
            this.showNotification('Failed to convert to order', 'error');
        }
    }

    async sendQuoteEmail(inquiryId) {
        const inquiry = this.inquiries.find(i => String(i.id) === String(inquiryId));
        if (!inquiry) return;

        try {
            const response = await fetch('/api/send-quote-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inquiryId })
            });

            if (response.ok) {
                this.showNotification('Quote email sent', 'success');
                inquiry.status = 'quoted';
                this.renderInquiries();
            }
        } catch (error) {
            console.error('Email error:', error);
            this.showNotification('Failed to send email', 'error');
        }
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatPrice(price) {
        return typeof price === 'number' ? price.toFixed(2) : '0.00';
    }

    showNotification(message, type = 'info') {
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    // Export inquiries to CSV
    exportToCSV() {
        if (this.inquiries.length === 0) {
            this.showNotification('No inquiries to export', 'warning');
            return;
        }

        const headers = ['Date', 'Customer Name', 'Email', 'Material Weight', 'Print Time', 'Total Quote', 'Status', 'Files'];
        const rows = this.inquiries.map(inquiry => {
            const quote = inquiry.quote || inquiry;
            return [
                this.formatDate(inquiry.createdAt || inquiry.timestamp),
                inquiry.customerName || '',
                inquiry.customerEmail || '',
                quote.materialWeight || 0,
                quote.printTime || 0,
                quote.subtotal || quote.totalQuote || 0,
                inquiry.status || 'pending',
                inquiry.files?.length || 0
            ];
        });

        const csv = [headers, ...rows].map(row => row.map(cell =>
            typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
        ).join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inquiries_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        this.showNotification('Inquiries exported to CSV', 'success');
    }
}

// Initialize on page load
let inquiriesSystem;
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('inquiriesTableBody')) {
        inquiriesSystem = new InquiriesSystem();
        window.inquiriesSystem = inquiriesSystem; // Make available globally
    }
});