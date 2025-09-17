// Bambu Printer Integration for Automated 3D Printing Queue
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

class BambuPrinterManager {
    constructor() {
        this.printers = [
            { id: 'X1C_1', name: 'Bambu X1C #1', ip: '192.168.1.101', status: 'idle', currentJob: null },
            { id: 'X1C_2', name: 'Bambu X1C #2', ip: '192.168.1.102', status: 'idle', currentJob: null },
            { id: 'P1S_1', name: 'Bambu P1S #1', ip: '192.168.1.103', status: 'idle', currentJob: null },
            { id: 'P1S_2', name: 'Bambu P1S #2', ip: '192.168.1.104', status: 'idle', currentJob: null },
            { id: 'A1_1', name: 'Bambu A1 #1', ip: '192.168.1.105', status: 'idle', currentJob: null },
            { id: 'A1_2', name: 'Bambu A1 #2', ip: '192.168.1.106', status: 'idle', currentJob: null }
        ];
        
        this.queue = [];
        this.completedJobs = [];
        this.queueFile = path.join(__dirname, 'printer_queue.json');
        this.jobsDir = path.join(__dirname, 'print_jobs');
    }

    async initialize() {
        console.log('🖨️ Initializing Bambu Printer Manager...');
        
        // Create directories if they don't exist
        await fs.mkdir(this.jobsDir, { recursive: true });
        
        // Load existing queue
        await this.loadQueue();
        
        // Connect to printers
        await this.connectToPrinters();
        
        console.log('✅ Printer Manager initialized');
    }

    async loadQueue() {
        try {
            const queueData = await fs.readFile(this.queueFile, 'utf8');
            this.queue = JSON.parse(queueData);
            console.log(`📋 Loaded ${this.queue.length} jobs from queue`);
        } catch (error) {
            console.log('📋 No existing queue found, starting fresh');
            this.queue = [];
        }
    }

    async saveQueue() {
        await fs.writeFile(this.queueFile, JSON.stringify(this.queue, null, 2));
        console.log(`💾 Queue saved (${this.queue.length} pending jobs)`);
    }

    async connectToPrinters() {
        console.log('🔌 Connecting to printers...');
        
        for (const printer of this.printers) {
            // In production, this would use Bambu's API or local network protocol
            // For now, we'll simulate the connection
            const isConnected = await this.checkPrinterConnection(printer);
            printer.connected = isConnected;
            
            if (isConnected) {
                console.log(`✅ Connected to ${printer.name}`);
                // Get printer status
                await this.updatePrinterStatus(printer);
            } else {
                console.log(`⚠️ Could not connect to ${printer.name}`);
            }
        }
    }

    async checkPrinterConnection(printer) {
        // Simulate connection check
        // In production, would ping the printer's IP or use Bambu API
        try {
            // Mock connection - in reality would be:
            // const response = await fetch(`http://${printer.ip}/api/status`);
            // return response.ok;
            
            // For demo, randomly succeed 80% of the time
            return Math.random() > 0.2;
        } catch (error) {
            return false;
        }
    }

    async updatePrinterStatus(printer) {
        // In production, would query printer's actual status via API
        // For now, simulate status
        
        if (printer.currentJob) {
            // Check if job is complete
            const jobDuration = Date.now() - new Date(printer.currentJob.startTime).getTime();
            const estimatedDuration = printer.currentJob.estimatedTime * 60 * 60 * 1000; // Convert hours to ms
            
            if (jobDuration >= estimatedDuration) {
                // Job complete
                console.log(`✅ Job completed on ${printer.name}`);
                this.completeJob(printer);
            } else {
                // Job still running
                const progress = (jobDuration / estimatedDuration) * 100;
                printer.currentJob.progress = Math.min(progress, 99);
                printer.status = 'printing';
            }
        }
    }

    async addToQueue(job) {
        const queueItem = {
            id: `JOB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            customer: job.customer,
            orderNumber: job.orderNumber,
            fileName: job.fileName || 'custom_part.3mf',
            material: job.material || 'PLA',
            color: job.color || 'default',
            quantity: job.quantity || 1,
            estimatedTime: job.estimatedTime || 2, // hours
            priority: job.priority || 'normal',
            status: 'queued',
            addedAt: new Date().toISOString(),
            notes: job.notes || ''
        };
        
        // Add to queue based on priority
        if (queueItem.priority === 'high') {
            // Find position after other high priority items
            const lastHighPriorityIndex = this.queue.findIndex(item => item.priority !== 'high');
            if (lastHighPriorityIndex === -1) {
                this.queue.push(queueItem);
            } else {
                this.queue.splice(lastHighPriorityIndex, 0, queueItem);
            }
        } else {
            this.queue.push(queueItem);
        }
        
        console.log(`📥 Added job ${queueItem.id} to queue (Priority: ${queueItem.priority})`);
        await this.saveQueue();
        
        // Try to assign to printer immediately
        await this.assignJobsToPrinters();
        
        return queueItem;
    }

    async assignJobsToPrinters() {
        console.log('🔄 Checking for available printers...');
        
        // Get idle printers
        const idlePrinters = this.printers.filter(p => p.status === 'idle' && p.connected);
        
        if (idlePrinters.length === 0) {
            console.log('⏸️ No idle printers available');
            return;
        }
        
        // Get pending jobs
        const pendingJobs = this.queue.filter(job => job.status === 'queued');
        
        if (pendingJobs.length === 0) {
            console.log('✅ No pending jobs in queue');
            return;
        }
        
        // Assign jobs to printers
        for (const printer of idlePrinters) {
            if (pendingJobs.length === 0) break;
            
            const job = pendingJobs.shift();
            await this.startPrintJob(printer, job);
        }
    }

    async startPrintJob(printer, job) {
        console.log(`🚀 Starting job ${job.id} on ${printer.name}`);
        
        // Update job status
        job.status = 'printing';
        job.printer = printer.name;
        job.startTime = new Date().toISOString();
        
        // Update printer status
        printer.status = 'printing';
        printer.currentJob = job;
        
        // In production, would send file to printer via API
        // await this.sendFileToPrinter(printer, job.fileName);
        
        // Save updated queue
        await this.saveQueue();
        
        // Generate print instructions file
        await this.generatePrintInstructions(printer, job);
        
        console.log(`✅ Job ${job.id} started on ${printer.name}`);
        
        // Simulate job progress (in production, would monitor actual printer)
        this.monitorPrintJob(printer, job);
    }

    async generatePrintInstructions(printer, job) {
        const instructions = {
            jobId: job.id,
            printer: printer.name,
            printerIP: printer.ip,
            customer: job.customer,
            orderNumber: job.orderNumber,
            fileName: job.fileName,
            material: job.material,
            color: job.color,
            quantity: job.quantity,
            estimatedTime: `${job.estimatedTime} hours`,
            startTime: job.startTime,
            notes: job.notes,
            slicerSettings: {
                layerHeight: '0.2mm',
                infill: '20%',
                supportMaterial: 'auto',
                printSpeed: 'standard',
                nozzleTemp: this.getMaterialTemp(job.material).nozzle,
                bedTemp: this.getMaterialTemp(job.material).bed
            }
        };
        
        const instructionsPath = path.join(this.jobsDir, `${job.id}_instructions.json`);
        await fs.writeFile(instructionsPath, JSON.stringify(instructions, null, 2));
        
        console.log(`📄 Print instructions saved: ${job.id}_instructions.json`);
    }

    getMaterialTemp(material) {
        const temps = {
            'PLA': { nozzle: 210, bed: 60 },
            'PETG': { nozzle: 240, bed: 80 },
            'ABS': { nozzle: 250, bed: 100 },
            'TPU': { nozzle: 230, bed: 60 },
            'Nylon': { nozzle: 260, bed: 80 }
        };
        return temps[material] || temps['PLA'];
    }

    async monitorPrintJob(printer, job) {
        // In production, would continuously monitor printer status
        // For demo, simulate progress updates
        
        const updateInterval = setInterval(async () => {
            await this.updatePrinterStatus(printer);
            
            if (printer.status !== 'printing') {
                clearInterval(updateInterval);
            }
        }, 30000); // Check every 30 seconds
    }

    async completeJob(printer) {
        const job = printer.currentJob;
        if (!job) return;
        
        // Update job status
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        job.progress = 100;
        
        // Move to completed jobs
        this.completedJobs.push(job);
        
        // Remove from active queue
        const queueIndex = this.queue.findIndex(j => j.id === job.id);
        if (queueIndex !== -1) {
            this.queue.splice(queueIndex, 1);
        }
        
        // Update printer status
        printer.status = 'idle';
        printer.currentJob = null;
        
        // Save updated queue
        await this.saveQueue();
        
        // Save completed jobs
        await this.saveCompletedJobs();
        
        console.log(`✅ Job ${job.id} completed on ${printer.name}`);
        
        // Try to assign next job
        await this.assignJobsToPrinters();
    }

    async saveCompletedJobs() {
        const completedPath = path.join(__dirname, 'completed_jobs.json');
        await fs.writeFile(completedPath, JSON.stringify(this.completedJobs, null, 2));
    }

    async getQueueStatus() {
        const status = {
            printers: this.printers.map(p => ({
                name: p.name,
                status: p.status,
                connected: p.connected,
                currentJob: p.currentJob ? {
                    id: p.currentJob.id,
                    customer: p.currentJob.customer,
                    progress: p.currentJob.progress || 0
                } : null
            })),
            queue: {
                total: this.queue.length,
                queued: this.queue.filter(j => j.status === 'queued').length,
                printing: this.queue.filter(j => j.status === 'printing').length,
                highPriority: this.queue.filter(j => j.priority === 'high').length
            },
            completedToday: this.completedJobs.filter(j => {
                const completedDate = new Date(j.completedAt);
                const today = new Date();
                return completedDate.toDateString() === today.toDateString();
            }).length,
            estimatedQueueTime: this.calculateQueueTime()
        };
        
        return status;
    }

    calculateQueueTime() {
        const queuedJobs = this.queue.filter(j => j.status === 'queued');
        const totalHours = queuedJobs.reduce((sum, job) => sum + (job.estimatedTime || 2), 0);
        const availablePrinters = this.printers.filter(p => p.connected).length || 1;
        const estimatedHours = totalHours / availablePrinters;
        
        return `${estimatedHours.toFixed(1)} hours`;
    }

    async emergencyStop(printerId) {
        const printer = this.printers.find(p => p.id === printerId);
        if (!printer) {
            console.error('Printer not found');
            return false;
        }
        
        console.log(`🛑 Emergency stop on ${printer.name}`);
        
        // In production, would send stop command to printer
        // await fetch(`http://${printer.ip}/api/stop`, { method: 'POST' });
        
        if (printer.currentJob) {
            printer.currentJob.status = 'cancelled';
            printer.currentJob.cancelledAt = new Date().toISOString();
        }
        
        printer.status = 'idle';
        printer.currentJob = null;
        
        await this.saveQueue();
        
        return true;
    }

    async pausePrinter(printerId) {
        const printer = this.printers.find(p => p.id === printerId);
        if (!printer || printer.status !== 'printing') {
            return false;
        }
        
        console.log(`⏸️ Pausing ${printer.name}`);
        printer.status = 'paused';
        
        // In production, would send pause command to printer
        // await fetch(`http://${printer.ip}/api/pause`, { method: 'POST' });
        
        return true;
    }

    async resumePrinter(printerId) {
        const printer = this.printers.find(p => p.id === printerId);
        if (!printer || printer.status !== 'paused') {
            return false;
        }
        
        console.log(`▶️ Resuming ${printer.name}`);
        printer.status = 'printing';
        
        // In production, would send resume command to printer
        // await fetch(`http://${printer.ip}/api/resume`, { method: 'POST' });
        
        return true;
    }
}

// Export for use in other modules
module.exports = BambuPrinterManager;

// If run directly, start monitoring
if (require.main === module) {
    const manager = new BambuPrinterManager();
    
    async function startMonitoring() {
        await manager.initialize();
        
        // Print status every minute
        setInterval(async () => {
            const status = await manager.getQueueStatus();
            console.log('\n📊 Printer Queue Status:');
            console.log(`Printers: ${status.printers.filter(p => p.connected).length}/${status.printers.length} connected`);
            console.log(`Queue: ${status.queue.queued} waiting, ${status.queue.printing} printing`);
            console.log(`Completed today: ${status.completedToday}`);
            console.log(`Estimated queue time: ${status.estimatedQueueTime}`);
        }, 60000);
        
        console.log('🖨️ Bambu Printer Manager running...');
    }
    
    startMonitoring().catch(console.error);
}