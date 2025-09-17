// Google Drive Sync Module - Complete Database Backup
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');

class GoogleDriveSync {
    constructor() {
        this.auth = null;
        this.drive = null;
        this.rootFolderId = null;
        this.SCOPES = [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive.appdata'
        ];
        this.TOKEN_PATH = path.join(__dirname, '..', 'token.json');
        this.CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');
        this.syncInterval = null;
    }

    // Initialize Google Drive connection
    async initialize() {
        try {
            // Load saved credentials if they exist
            const hasCredentials = await this.loadSavedCredentialsIfExist();

            if (!this.auth) {
                // Try to load from token file if it exists
                try {
                    const tokenContent = await fs.readFile(this.TOKEN_PATH, 'utf8');
                    const credentials = JSON.parse(tokenContent);
                    this.auth = google.auth.fromJSON(credentials);

                    if (this.auth) {
                        this.drive = google.drive({ version: 'v3', auth: this.auth });
                        await this.setupRootFolder();
                        console.log('✅ Google Drive sync restored from saved token');
                        return true;
                    }
                } catch (tokenError) {
                    console.log('⚠️ No saved Google Drive token found');
                }

                // Need to authenticate
                console.log('⚠️ Google Drive authentication required');
                return false;
            }

            this.drive = google.drive({ version: 'v3', auth: this.auth });

            // Create or find root folder for app data
            await this.setupRootFolder();

            console.log('✅ Google Drive sync initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize Google Drive:', error);
            return false;
        }
    }

    // Load previously saved credentials
    async loadSavedCredentialsIfExist() {
        try {
            const content = await fs.readFile(this.TOKEN_PATH);
            const credentials = JSON.parse(content);
            this.auth = google.auth.fromJSON(credentials);
            return true;
        } catch (err) {
            return false;
        }
    }

    // Save credentials for future use
    async saveCredentials(client) {
        const content = await fs.readFile(this.CREDENTIALS_PATH);
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        const payload = JSON.stringify({
            type: 'authorized_user',
            client_id: key.client_id,
            client_secret: key.client_secret,
            refresh_token: client.credentials.refresh_token,
            access_token: client.credentials.access_token,
        });
        await fs.writeFile(this.TOKEN_PATH, payload);
    }

    // Authenticate with Google Drive
    async authenticate() {
        try {
            const client = await authenticate({
                scopes: this.SCOPES,
                keyfilePath: this.CREDENTIALS_PATH,
            });

            if (client.credentials) {
                await this.saveCredentials(client);
            }

            this.auth = client;
            this.drive = google.drive({ version: 'v3', auth: this.auth });

            await this.setupRootFolder();

            return true;
        } catch (error) {
            console.error('Authentication failed:', error);
            return false;
        }
    }

    // Setup root folder structure in Google Drive
    async setupRootFolder() {
        try {
            // Search for existing app folder
            const response = await this.drive.files.list({
                q: "name='3D_Print_Business_Data' and mimeType='application/vnd.google-apps.folder'",
                spaces: 'drive',
                fields: 'files(id, name)',
            });

            if (response.data.files.length > 0) {
                this.rootFolderId = response.data.files[0].id;
                console.log('✅ Found existing Drive folder');
            } else {
                // Create new root folder
                const folderMetadata = {
                    name: '3D_Print_Business_Data',
                    mimeType: 'application/vnd.google-apps.folder',
                };
                const folder = await this.drive.files.create({
                    resource: folderMetadata,
                    fields: 'id',
                });
                this.rootFolderId = folder.data.id;
                console.log('✅ Created new Drive folder');
            }

            // Create subfolders
            await this.createSubfolders();
        } catch (error) {
            console.error('Failed to setup root folder:', error);
            throw error;
        }
    }

    // Create subfolder structure
    async createSubfolders() {
        const subfolders = [
            'inquiries',
            'orders',
            'inventory',
            'printer_data',
            'stl_files',
            'customer_data',
            'reports',
            'backups'
        ];

        for (const folderName of subfolders) {
            await this.ensureFolder(folderName);
        }
    }

    // Ensure a folder exists
    async ensureFolder(folderName) {
        try {
            const response = await this.drive.files.list({
                q: `name='${folderName}' and '${this.rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder'`,
                spaces: 'drive',
                fields: 'files(id, name)',
            });

            if (response.data.files.length === 0) {
                // Create folder
                const folderMetadata = {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [this.rootFolderId],
                };
                await this.drive.files.create({
                    resource: folderMetadata,
                    fields: 'id',
                });
                console.log(`📁 Created folder: ${folderName}`);
            }
        } catch (error) {
            console.error(`Failed to ensure folder ${folderName}:`, error);
        }
    }

    // Upload a file to Google Drive
    async uploadFile(filePath, fileName, folderId = null) {
        try {
            const fs = require('fs');
            const fileMetadata = {
                name: fileName,
                parents: [folderId || this.rootFolderId],
            };

            // Use createReadStream for proper file streaming
            const media = {
                mimeType: 'application/octet-stream',
                body: fs.createReadStream(filePath),
            };

            const response = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, webViewLink',
            });

            console.log(`✅ Uploaded ${fileName} to Drive`);
            return response.data;
        } catch (error) {
            console.error(`Failed to upload ${fileName}:`, error);
            throw error;
        }
    }

    // Upload STL/3MF files
    async uploadSTLFile(filePath, originalName) {
        try {
            const stlFolderId = await this.getFolderId('stl_files');

            // Check if file already exists
            const existing = await this.drive.files.list({
                q: `name='${originalName}' and '${stlFolderId}' in parents`,
                spaces: 'drive',
                fields: 'files(id, name)',
            });

            let fileId;
            if (existing.data.files.length > 0) {
                // Update existing file
                fileId = existing.data.files[0].id;
                const fsSync = require('fs');
                const media = {
                    mimeType: 'application/octet-stream',
                    body: fsSync.createReadStream(filePath),
                };
                await this.drive.files.update({
                    fileId: fileId,
                    media: media,
                });
                console.log(`✅ Updated STL file: ${originalName}`);
            } else {
                // Upload new file
                const result = await this.uploadFile(filePath, originalName, stlFolderId);
                fileId = result.id;
            }

            return fileId;
        } catch (error) {
            console.error('Failed to upload STL file:', error);
            throw error;
        }
    }

    // Get folder ID by name
    async getFolderId(folderName) {
        try {
            const response = await this.drive.files.list({
                q: `name='${folderName}' and '${this.rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder'`,
                spaces: 'drive',
                fields: 'files(id)',
            });

            if (response.data.files.length > 0) {
                return response.data.files[0].id;
            }
            return this.rootFolderId;
        } catch (error) {
            console.error(`Failed to get folder ID for ${folderName}:`, error);
            return this.rootFolderId;
        }
    }

    // Sync all inquiries to Drive
    async syncInquiries(inquiries) {
        try {
            const folderId = await this.getFolderId('inquiries');
            const data = JSON.stringify(inquiries, null, 2);
            const fileName = `inquiries_${new Date().toISOString().split('T')[0]}.json`;

            // Create temp file
            const tempPath = path.join(__dirname, '..', 'temp', fileName);
            await fs.mkdir(path.dirname(tempPath), { recursive: true });
            await fs.writeFile(tempPath, data);

            // Upload to Drive
            await this.uploadFile(tempPath, fileName, folderId);

            // Clean up
            await fs.unlink(tempPath);

            console.log(`✅ Synced ${inquiries.length} inquiries to Drive`);
            return true;
        } catch (error) {
            console.error('Failed to sync inquiries:', error);
            return false;
        }
    }

    // Sync orders to Drive
    async syncOrders(orders) {
        try {
            const folderId = await this.getFolderId('orders');
            const data = JSON.stringify(orders, null, 2);
            const fileName = `orders_${new Date().toISOString().split('T')[0]}.json`;

            const tempPath = path.join(__dirname, '..', 'temp', fileName);
            await fs.mkdir(path.dirname(tempPath), { recursive: true });
            await fs.writeFile(tempPath, data);

            await this.uploadFile(tempPath, fileName, folderId);
            await fs.unlink(tempPath);

            console.log(`✅ Synced ${orders.length} orders to Drive`);
            return true;
        } catch (error) {
            console.error('Failed to sync orders:', error);
            return false;
        }
    }

    // Sync inventory to Drive
    async syncInventory(inventory) {
        try {
            const folderId = await this.getFolderId('inventory');
            const data = JSON.stringify(inventory, null, 2);
            const fileName = `inventory_${new Date().toISOString().split('T')[0]}.json`;

            const tempPath = path.join(__dirname, '..', 'temp', fileName);
            await fs.mkdir(path.dirname(tempPath), { recursive: true });
            await fs.writeFile(tempPath, data);

            await this.uploadFile(tempPath, fileName, folderId);
            await fs.unlink(tempPath);

            console.log(`✅ Synced inventory to Drive`);
            return true;
        } catch (error) {
            console.error('Failed to sync inventory:', error);
            return false;
        }
    }

    // Sync printer data to Drive
    async syncPrinterData(printerData) {
        try {
            const folderId = await this.getFolderId('printer_data');
            const data = JSON.stringify(printerData, null, 2);
            const fileName = `printer_status_${new Date().toISOString()}.json`;

            const tempPath = path.join(__dirname, '..', 'temp', fileName);
            await fs.mkdir(path.dirname(tempPath), { recursive: true });
            await fs.writeFile(tempPath, data);

            await this.uploadFile(tempPath, fileName, folderId);
            await fs.unlink(tempPath);

            console.log(`✅ Synced printer data to Drive`);
            return true;
        } catch (error) {
            console.error('Failed to sync printer data:', error);
            return false;
        }
    }

    // Create full backup of all data
    async createFullBackup(data) {
        try {
            const folderId = await this.getFolderId('backups');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `full_backup_${timestamp}.json`;

            const backupData = {
                timestamp: new Date().toISOString(),
                version: '1.0',
                data: {
                    inquiries: data.inquiries || [],
                    orders: data.orders || [],
                    inventory: data.inventory || [],
                    printers: data.printers || [],
                    customers: data.customers || [],
                    settings: data.settings || {}
                }
            };

            const tempPath = path.join(__dirname, '..', 'temp', fileName);
            await fs.mkdir(path.dirname(tempPath), { recursive: true });
            await fs.writeFile(tempPath, JSON.stringify(backupData, null, 2));

            const result = await this.uploadFile(tempPath, fileName, folderId);
            await fs.unlink(tempPath);

            console.log(`✅ Created full backup: ${fileName}`);
            return result;
        } catch (error) {
            console.error('Failed to create backup:', error);
            throw error;
        }
    }

    // Download file from Drive
    async downloadFile(fileId, destPath) {
        try {
            const response = await this.drive.files.get(
                { fileId: fileId, alt: 'media' },
                { responseType: 'stream' }
            );

            const dest = fs.createWriteStream(destPath);
            response.data
                .on('end', () => console.log('✅ File downloaded'))
                .on('error', err => console.error('Download error:', err))
                .pipe(dest);

            return true;
        } catch (error) {
            console.error('Failed to download file:', error);
            return false;
        }
    }

    // List files in a folder
    async listFiles(folderName) {
        try {
            const folderId = await this.getFolderId(folderName);
            const response = await this.drive.files.list({
                q: `'${folderId}' in parents`,
                fields: 'files(id, name, createdTime, size, webViewLink)',
                orderBy: 'createdTime desc',
            });

            return response.data.files;
        } catch (error) {
            console.error(`Failed to list files in ${folderName}:`, error);
            return [];
        }
    }

    // Start automatic sync
    startAutoSync(interval = 300000) { // 5 minutes default
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        this.syncInterval = setInterval(async () => {
            console.log('🔄 Running automatic Google Drive sync...');
            // This will be called from server.js with actual data
            this.emit('sync-required');
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
}

// Make it an EventEmitter
const EventEmitter = require('events');
Object.setPrototypeOf(GoogleDriveSync.prototype, EventEmitter.prototype);

module.exports = GoogleDriveSync;