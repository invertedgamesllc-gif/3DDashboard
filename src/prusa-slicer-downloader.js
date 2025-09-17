const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class PrusaSlicerDownloader {
    constructor() {
        this.installDir = path.join(__dirname, '..', 'tools', 'PrusaSlicer');
        this.exePath = path.join(this.installDir, 'prusa-slicer-console.exe');
        // PrusaSlicer 2.9.2 Windows x64 portable
        this.downloadUrl = 'https://github.com/prusa3d/PrusaSlicer/releases/download/version_2.9.2/PrusaSlicer-2.9.2-win64.zip';
    }

    async ensureInstalled() {
        // Check if already installed
        if (fs.existsSync(this.exePath)) {
            console.log('PrusaSlicer already installed at:', this.exePath);
            return this.exePath;
        }
        
        // Check in subdirectory (if already extracted)
        const altPath = path.join(this.installDir, 'PrusaSlicer-2.9.2', 'prusa-slicer-console.exe');
        if (fs.existsSync(altPath)) {
            console.log('PrusaSlicer found at:', altPath);
            this.exePath = altPath;
            return this.exePath;
        }

        console.log('PrusaSlicer not found. Downloading portable version...');
        await this.downloadAndExtract();
        return this.exePath;
    }

    async downloadAndExtract() {
        const zipPath = path.join(this.installDir, 'prusaslicer.zip');
        
        // Create directory
        if (!fs.existsSync(this.installDir)) {
            fs.mkdirSync(this.installDir, { recursive: true });
        }

        // Download using PowerShell (more reliable for GitHub releases)
        console.log('Downloading PrusaSlicer from GitHub...');
        console.log('This may take a few minutes (50MB download)...');
        const downloadCmd = `powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${this.downloadUrl}' -OutFile '${zipPath}' -UseBasicParsing"`;
        
        try {
            await execAsync(downloadCmd, { maxBuffer: 1024 * 1024 * 10 });
            console.log('Download complete.');
        } catch (error) {
            console.error('Download failed:', error);
            throw error;
        }
        
        // Verify download
        if (!fs.existsSync(zipPath)) {
            throw new Error('Download failed - zip file not found');
        }
        
        // Extract using PowerShell
        console.log('Extracting PrusaSlicer...');
        const extractCmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${this.installDir}' -Force"`;
        await execAsync(extractCmd);
        
        // Find the extracted folder (it might be in a subdirectory)
        const extractedDir = path.join(this.installDir, 'PrusaSlicer-2.9.2');
        if (fs.existsSync(extractedDir)) {
            // Move contents up one level
            const files = fs.readdirSync(extractedDir);
            for (const file of files) {
                const srcPath = path.join(extractedDir, file);
                const destPath = path.join(this.installDir, file);
                if (fs.existsSync(destPath)) {
                    fs.rmSync(destPath, { recursive: true, force: true });
                }
                fs.renameSync(srcPath, destPath);
            }
            fs.rmdirSync(extractedDir);
        }
        
        // Clean up zip file
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }
        
        // Verify the executable exists
        if (!fs.existsSync(this.exePath)) {
            // It might be in a subdirectory
            const altPath = path.join(this.installDir, 'PrusaSlicer-2.9.2', 'prusa-slicer-console.exe');
            if (fs.existsSync(altPath)) {
                this.exePath = altPath;
            } else {
                throw new Error('PrusaSlicer executable not found after extraction');
            }
        }
        
        console.log('PrusaSlicer installed successfully!');
    }
}

module.exports = PrusaSlicerDownloader;