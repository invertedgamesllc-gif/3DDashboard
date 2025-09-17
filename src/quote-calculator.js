// Quote Calculator Module - Handles all quote calculations and file management
class QuoteCalculator {
    constructor() {
        this.files = [];
        this.currentQuote = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Skip file upload handler - let the main HTML handle it
        // The HTML already has its own handleFileUpload function
        // that properly manages pendingFiles for batch upload

        // Form field change handlers - Skip fields that already have inline handlers
        // Skip these as they have oninput handlers in HTML: materialWeight, printTime, numBeds, laborTime, shippingCost
        // Only add listener for materialType which uses change event
        const materialType = document.getElementById('materialType');
        if (materialType) {
            materialType.addEventListener('change', () => {
                // Call the global calculateQuote function instead of this.calculateQuote
                if (typeof calculateQuote === 'function') {
                    calculateQuote();
                }
            });
        }
    }

    async handleFileUpload(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        // Filter for 3D model files
        const validFiles = files.filter(file => {
            const ext = file.name.toLowerCase().split('.').pop();
            return ['stl', '3mf', 'obj', 'step', 'stp', 'iges', 'igs'].includes(ext);
        });

        if (validFiles.length === 0) {
            this.showNotification('Please select valid 3D model files (STL, 3MF, OBJ, etc.)', 'error');
            return;
        }

        // Upload files to server
        const formData = new FormData();
        validFiles.forEach(file => formData.append('files', file));

        try {
            const cloudflareUrl = localStorage.getItem('cloudflareWorkerUrl') || 'http://localhost:8787';
            const response = await fetch(`${cloudflareUrl}/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const result = await response.json();
            console.log('Files uploaded:', result);

            // Store file information
            this.files = result.files.map(f => ({
                name: f.originalname,
                size: f.size,
                type: f.mimetype,
                serverFilename: f.filename,
                path: f.path,
                driveId: f.driveId || null,
                uploadedAt: new Date().toISOString()
            }));

            this.updateFilesList();
            this.showNotification(`✅ Uploaded ${this.files.length} files successfully`, 'success');

            // Auto-populate weight and time if slicer integration is available
            if (result.slicerData) {
                this.populateFromSlicerData(result.slicerData);
            }

        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification('❌ Failed to upload files', 'error');
        }
    }

    updateFilesList() {
        const container = document.getElementById('uploadedFilesList');
        if (!container) return;

        if (this.files.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">No files uploaded yet</p>';
            return;
        }

        container.innerHTML = `
            <div class="files-list">
                ${this.files.map(file => `
                    <div class="file-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(59, 130, 246, 0.05); border-radius: 6px; margin-bottom: 8px;">
                        <div>
                            <strong>${file.name}</strong>
                            <span style="color: var(--text-muted); font-size: 12px; margin-left: 8px;">
                                (${(file.size / 1024).toFixed(2)} KB)
                            </span>
                            ${file.driveId ? '<span style="color: #22c55e; margin-left: 8px;">☁️</span>' : ''}
                        </div>
                        <button onclick="quoteCalculator.removeFile('${file.serverFilename}')" class="btn btn-small" style="padding: 4px 8px; font-size: 12px;">
                            ❌
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    removeFile(serverFilename) {
        this.files = this.files.filter(f => f.serverFilename !== serverFilename);
        this.updateFilesList();

        // Reset file input
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';
    }

    calculateQuote() {
        // Use the global calculateQuote function if it exists
        if (typeof window.calculateQuote === 'function') {
            return window.calculateQuote();
        }

        // Fallback calculation only if global function doesn't exist
        const materialWeight = parseFloat(document.getElementById('materialWeight')?.value) || 0;
        const printTime = parseFloat(document.getElementById('printTime')?.value) || 0;
        const numBeds = parseInt(document.getElementById('numBeds')?.value) || 1;
        const laborTime = parseFloat(document.getElementById('laborTime')?.value) || 0;
        const shippingCost = parseFloat(document.getElementById('shippingCost')?.value) || 0;
        const materialType = document.getElementById('materialType')?.value || 'PLA';

        // Material costs per gram
        const materialCosts = {
            'PLA': 0.03,
            'PETG': 0.04,
            'ABS': 0.035,
            'TPU': 0.06,
            'Nylon': 0.08,
            'Resin': 0.10
        };

        // Base calculations (keeping your formula logic)
        const K3 = materialWeight; // Weight in grams
        const L3 = printTime; // Print time in hours
        const M3 = numBeds; // Number of beds

        // Cost calculations
        const B4 = K3 * (materialCosts[materialType] || 0.03); // Material cost
        const C4 = L3 * 2.50; // Machine time cost ($2.50/hour)
        const D4 = laborTime * 25.00; // Labor cost ($25/hour)

        // Multi-day printing surcharge
        const E4 = L3 > 24 ? Math.floor(L3 / 24) * 5 : 0;

        // Multiple bed charge
        const F4 = M3 > 1 ? (M3 - 1) * 3 : 0;

        // Shipping
        const G4 = shippingCost;

        // Subtotal
        const H4 = B4 + C4 + D4 + E4 + F4 + G4;

        // Store current quote
        this.currentQuote = {
            materialWeight: K3,
            printTime: L3,
            numBeds: M3,
            laborTime,
            materialType,
            materialCost: B4,
            printerCost: C4,
            laborCost: D4,
            multidayCost: E4,
            bedCost: F4,
            shippingCost: G4,
            subtotal: H4,
            files: this.files
        };

        // Update display
        this.updateQuoteDisplay();

        return H4;
    }

    updateQuoteDisplay() {
        if (!this.currentQuote) return;

        const q = this.currentQuote;

        // Update cost breakdown
        document.getElementById('materialCost').textContent = `$${q.materialCost.toFixed(2)}`;
        document.getElementById('printerCost').textContent = `$${q.printerCost.toFixed(2)}`;
        document.getElementById('laborCost').textContent = `$${q.laborCost.toFixed(2)}`;
        document.getElementById('multidayCost').textContent = `$${q.multidayCost.toFixed(2)}`;
        document.getElementById('bedCost').textContent = `$${q.bedCost.toFixed(2)}`;
        document.getElementById('displayShippingCost').textContent = `$${q.shippingCost.toFixed(2)}`;
        document.getElementById('subtotal').textContent = `$${q.subtotal.toFixed(2)}`;
        document.getElementById('totalQuote').textContent = `$${q.subtotal.toFixed(2)}`;

        // Update project summary
        document.getElementById('summaryWeight').textContent = `Weight: ${q.materialWeight} grams`;
        document.getElementById('summaryTime').textContent = `Print Time: ${q.printTime} hours`;
        document.getElementById('summaryMaterial').textContent = `Material: ${q.materialType}`;
        document.getElementById('summaryBeds').textContent = `Beds Required: ${q.numBeds}`;
    }

    async saveAsInquiry() {
        // Call the main HTML's save function if it exists
        if (typeof window.saveQuoteToInquiries === 'function') {
            return window.saveQuoteToInquiries();
        }

        // Fallback validation only if main function doesn't exist
        const customerName = document.getElementById('customerName')?.value?.trim();
        const customerEmail = document.getElementById('customerEmail')?.value?.trim();
        const projectDescription = document.getElementById('projectDescription')?.value?.trim();

        if (!customerName || !customerEmail) {
            this.showNotification('Please enter customer name and email', 'error');
            return false;
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(customerEmail)) {
            this.showNotification('Please enter a valid email address', 'error');
            return false;
        }

        // Check if there's actually data to save
        const materialWeightValue = document.getElementById('materialWeight')?.value;
        const printTimeValue = document.getElementById('printTime')?.value;

        if (!materialWeightValue || !printTimeValue) {
            this.showNotification('Please enter at least weight and print time', 'error');
            return false;
        }

        // Get quote values from the UI
        const materialWeight = parseFloat(materialWeightValue) || 0;
        const printTime = parseFloat(printTimeValue) || 0;
        const subtotal = document.getElementById('totalQuote')?.textContent || '$0.00';

        // Create inquiry object
        const inquiry = {
            customerName,
            customerEmail,
            projectDescription: projectDescription || '',
            quote: {
                materialWeight,
                printTime,
                subtotal: parseFloat(subtotal.replace(/[$,]/g, '')) || 0,
                materialType: document.getElementById('materialType')?.value || 'PLA'
            },
            files: this.files,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        try {
            // Save to Cloudflare worker
            const cloudflareUrl = localStorage.getItem('cloudflareWorkerUrl') || 'http://localhost:8787';
            const response = await fetch(`${cloudflareUrl}/api/inquiries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerName: inquiry.customerName,
                    customerEmail: inquiry.customerEmail,
                    projectDescription: inquiry.projectDescription,
                    materialWeight: inquiry.quote?.materialWeight || 0,
                    printTime: inquiry.quote?.printTime || 0,
                    materialType: inquiry.quote?.materialType || 'PLA',
                    totalQuote: inquiry.quote?.subtotal || 0,
                    status: inquiry.status,
                    files: inquiry.files || []
                })
            });

            if (!response.ok) throw new Error('Failed to save inquiry');

            const result = await response.json();
            console.log('Inquiry saved:', result);

            // Also save to localStorage for local integration
            const localInquiry = {
                id: result.inquiry?.id || Date.now(),
                timestamp: new Date().toISOString(),
                customerName: inquiry.customerName,
                customerEmail: inquiry.customerEmail,
                projectDescription: inquiry.projectDescription,
                materialWeight: inquiry.quote?.materialWeight || 0,
                printTime: inquiry.quote?.printTime || 0,
                materialType: inquiry.quote?.materialType || 'PLA',
                totalQuote: `$${(inquiry.quote?.subtotal || 0).toFixed(2)}`,
                status: inquiry.status,
                files: inquiry.files || [],
                hasFiles: (inquiry.files || []).length > 0
            };

            // Save to localStorage
            let localInquiries = JSON.parse(localStorage.getItem('inquiries') || '[]');
            localInquiries.unshift(localInquiry);
            localStorage.setItem('inquiries', JSON.stringify(localInquiries));

            // Refresh inquiries display if function exists
            if (typeof loadInquiries === 'function') {
                loadInquiries();
            }

            this.showNotification(`✅ Quote saved for ${customerName}`, 'success');

            // Switch to inquiries tab
            const inquiriesTab = document.querySelector('.nav-tab[onclick*="inquiries"]');
            const inquiriesPage = document.getElementById('inquiries');
            if (inquiriesTab && inquiriesPage) {
                // Remove active from all tabs
                document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('.page-content').forEach(page => page.classList.remove('active'));

                // Activate inquiries tab
                inquiriesTab.classList.add('active');
                inquiriesPage.classList.add('active');
            }

            // Clear form after successful save
            if (confirm('Quote saved! Clear form for new quote?')) {
                this.clearForm();
            }

            return result.inquiry;

        } catch (error) {
            console.error('Save error:', error);
            this.showNotification('❌ Failed to save inquiry', 'error');
            return false;
        }
    }

    clearForm() {
        // Clear input fields
        ['materialWeight', 'printTime', 'numBeds', 'laborTime', 'shippingCost',
         'customerName', 'customerEmail', 'projectDescription'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });

        // Reset material type
        const materialType = document.getElementById('materialType');
        if (materialType) materialType.selectedIndex = 0;

        // Clear files
        this.files = [];
        this.currentQuote = null;
        this.updateFilesList();

        // Reset displays
        ['materialCost', 'printerCost', 'laborCost', 'multidayCost',
         'bedCost', 'displayShippingCost', 'subtotal', 'totalQuote'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '$0.00';
        });

        // Reset summary
        document.getElementById('summaryWeight').textContent = 'Weight: - grams';
        document.getElementById('summaryTime').textContent = 'Print Time: - hours';
        document.getElementById('summaryMaterial').textContent = 'Material: -';
        document.getElementById('summaryBeds').textContent = 'Beds Required: -';

        // Reset file input
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';

        this.showNotification('Form cleared', 'success');
    }

    populateFromSlicerData(slicerData) {
        if (slicerData.weight) {
            document.getElementById('materialWeight').value = slicerData.weight;
        }
        if (slicerData.printTime) {
            document.getElementById('printTime').value = slicerData.printTime;
        }
        this.calculateQuote();
    }

    showNotification(message, type = 'info') {
        // Use existing notification function if available
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    exportQuote() {
        if (!this.currentQuote) {
            this.showNotification('No quote to export', 'error');
            return;
        }

        const customerName = document.getElementById('customerName')?.value || 'Customer';
        const date = new Date().toLocaleDateString();

        const quoteText = `
3D PRINTING QUOTE
=================
Date: ${date}
Customer: ${customerName}

PROJECT DETAILS
--------------
Material: ${this.currentQuote.materialType}
Weight: ${this.currentQuote.materialWeight} grams
Print Time: ${this.currentQuote.printTime} hours
Beds Required: ${this.currentQuote.numBeds}

COST BREAKDOWN
-------------
Material Cost: $${this.currentQuote.materialCost.toFixed(2)}
Machine Time: $${this.currentQuote.printerCost.toFixed(2)}
Labor: $${this.currentQuote.laborCost.toFixed(2)}
Multi-day Surcharge: $${this.currentQuote.multidayCost.toFixed(2)}
Multiple Bed Charge: $${this.currentQuote.bedCost.toFixed(2)}
Shipping: $${this.currentQuote.shippingCost.toFixed(2)}

TOTAL: $${this.currentQuote.subtotal.toFixed(2)}

Files: ${this.files.map(f => f.name).join(', ')}
        `.trim();

        // Create download
        const blob = new Blob([quoteText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quote_${customerName.replace(/\s+/g, '_')}_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        this.showNotification('Quote exported', 'success');
    }
}

// Initialize on page load
let quoteCalculator;
document.addEventListener('DOMContentLoaded', () => {
    quoteCalculator = new QuoteCalculator();
    window.quoteCalculator = quoteCalculator; // Make available globally
});