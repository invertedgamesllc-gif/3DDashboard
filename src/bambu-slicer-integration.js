// Bambu Studio Slicer Integration
// Extracts accurate filament usage data from Bambu Studio slicing

const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

class BambuSlicerIntegration {
    constructor() {
        // Common Bambu Studio installation paths
        this.bambuPaths = [
            'C:\\Program Files\\Bambu Studio\\bambu-studio.exe',
            'C:\\Program Files (x86)\\Bambu Studio\\bambu-studio.exe',
            'C:\\Program Files\\BambuStudio\\BambuStudio.exe',
            path.join(process.env.LOCALAPPDATA || '', 'BambuStudio\\BambuStudio.exe'),
            path.join(process.env.PROGRAMFILES || '', 'Bambu Studio\\bambu-studio.exe')
        ];

        // Bambu Studio CLI executable (if available)
        this.bambuCliPaths = [
            'C:\\Program Files\\Bambu Studio\\bambu-studio-cli.exe',
            'C:\\Program Files\\Bambu Studio\\bambu-studio-console.exe',
            'C:\\Program Files\\BambuStudio\\bambu-studio-cli.exe'
        ];

        this.bambuPath = null;
        this.bambuCliPath = null;
        this.tempDir = path.join(__dirname, '..', 'temp-slicing');
        this.profilesDir = path.join(__dirname, '..', 'bambu-profiles');
        
        this.initialize();
    }

    async initialize() {
        // Create necessary directories
        await fs.mkdir(this.tempDir, { recursive: true }).catch(() => {});
        await fs.mkdir(this.profilesDir, { recursive: true }).catch(() => {});

        // Find Bambu Studio installation
        for (const possiblePath of this.bambuPaths) {
            try {
                await fs.access(possiblePath);
                this.bambuPath = possiblePath;
                console.log(`✅ Found Bambu Studio at: ${possiblePath}`);
                break;
            } catch {
                // Try next path
            }
        }

        // Find Bambu Studio CLI
        for (const possiblePath of this.bambuCliPaths) {
            try {
                await fs.access(possiblePath);
                this.bambuCliPath = possiblePath;
                console.log(`✅ Found Bambu Studio CLI at: ${possiblePath}`);
                break;
            } catch {
                // Try next path
            }
        }

        if (!this.bambuPath && !this.bambuCliPath) {
            console.log('⚠️ Bambu Studio not found. Please install from: https://bambulab.com/en/download/studio');
        }

        // Create default profiles
        await this.createDefaultProfiles();
    }

    async createDefaultProfiles() {
        // Create Bambu-specific slicing profiles for accurate weight calculation
        const profiles = {
            'standard': {
                layer_height: 0.20,
                initial_layer_height: 0.20,
                wall_loops: 2,
                top_shell_layers: 5,
                bottom_shell_layers: 4,
                sparse_infill_density: 15,
                sparse_infill_pattern: 'gyroid',
                enable_support: true,
                support_type: 'normal(auto)',
                support_threshold_angle: 45,
                support_density: 15,
                filament_diameter: 1.75,
                filament_density: 1.24, // PLA
                filament_cost: 20, // $/kg
                nozzle_diameter: 0.4,
                print_speed: 150,
                travel_speed: 250
            },
            'quality': {
                layer_height: 0.12,
                initial_layer_height: 0.20,
                wall_loops: 3,
                top_shell_layers: 7,
                bottom_shell_layers: 5,
                sparse_infill_density: 20,
                sparse_infill_pattern: 'cubic',
                enable_support: true,
                support_type: 'normal(auto)',
                support_threshold_angle: 45,
                support_density: 15,
                filament_diameter: 1.75,
                filament_density: 1.24,
                filament_cost: 20,
                nozzle_diameter: 0.4,
                print_speed: 100,
                travel_speed: 200
            },
            'draft': {
                layer_height: 0.28,
                initial_layer_height: 0.28,
                wall_loops: 2,
                top_shell_layers: 3,
                bottom_shell_layers: 3,
                sparse_infill_density: 10,
                sparse_infill_pattern: 'grid',
                enable_support: true,
                support_type: 'normal(auto)',
                support_threshold_angle: 50,
                support_density: 10,
                filament_diameter: 1.75,
                filament_density: 1.24,
                filament_cost: 20,
                nozzle_diameter: 0.4,
                print_speed: 200,
                travel_speed: 300
            }
        };

        for (const [name, settings] of Object.entries(profiles)) {
            const profilePath = path.join(this.profilesDir, `${name}.json`);
            try {
                await fs.writeFile(profilePath, JSON.stringify(settings, null, 2));
            } catch (error) {
                console.error(`Error creating profile ${name}:`, error.message);
            }
        }
    }

    async sliceWithBambuStudio(filePath, options = {}) {
        const {
            material = 'PLA',
            profile = 'standard',
            printer = 'Bambu X1C',
            quantity = 1,
            infill = 15,
            supportEnabled = true,
            layerHeight = 0.2
        } = options;

        // Material densities (g/cm³)
        const materialDensities = {
            'PLA': 1.24,
            'PETG': 1.27,
            'ABS': 1.04,
            'ASA': 1.07,
            'TPU': 1.21,
            'PC': 1.20,
            'Nylon': 1.14,
            'PVA': 1.23,
            'HIPS': 1.04
        };

        const density = materialDensities[material] || 1.24;

        try {
            // Method 1: Try using Bambu Studio CLI if available
            if (this.bambuCliPath) {
                return await this.sliceWithCLI(filePath, options, density);
            }

            // Method 2: Use Bambu Studio with automation
            if (this.bambuPath) {
                return await this.sliceWithAutomation(filePath, options, density);
            }

            // Method 3: Parse existing .gcode.3mf files if available
            const gcodeData = await this.parseExistingGcode(filePath, options, density);
            if (gcodeData) return gcodeData;

            // Method 4: Use advanced estimation based on Bambu's slicing algorithms
            return await this.advancedEstimation(filePath, options, density);

        } catch (error) {
            console.error('Bambu slicing error:', error.message);
            throw error;
        }
    }

    async sliceWithCLI(filePath, options, density) {
        const outputPath = path.join(this.tempDir, `${Date.now()}.gcode`);
        const profilePath = path.join(this.profilesDir, `${options.profile || 'standard'}.json`);

        // Build CLI command for Bambu Studio
        const command = [
            `"${this.bambuCliPath}"`,
            'slice',
            `--load-config "${profilePath}"`,
            `--output "${outputPath}"`,
            `--info`, // Output slicing info
            `"${filePath}"`
        ].join(' ');

        try {
            const { stdout, stderr } = await execPromise(command, { 
                timeout: 60000 // 1 minute timeout
            });

            // Parse the output
            const result = this.parseBambuOutput(stdout + stderr, density);

            // Try to read the generated G-code for more accurate data
            try {
                const gcodeContent = await fs.readFile(outputPath, 'utf8');
                const gcodeData = this.parseGcode(gcodeContent, density);
                
                // Merge data
                Object.assign(result, gcodeData);
            } catch {}

            // Clean up
            await fs.unlink(outputPath).catch(() => {});

            return result;
        } catch (error) {
            throw new Error(`Bambu CLI slicing failed: ${error.message}`);
        }
    }

    async sliceWithAutomation(filePath, options, density) {
        // Use Puppeteer or similar to automate Bambu Studio GUI
        // This is more complex but works when CLI is not available
        
        const outputDir = path.join(this.tempDir, `slice_${Date.now()}`);
        await fs.mkdir(outputDir, { recursive: true });

        return new Promise((resolve, reject) => {
            // Launch Bambu Studio with the file
            const bambuProcess = spawn(this.bambuPath, [filePath], {
                detached: false,
                stdio: 'pipe'
            });

            // Set a timeout to read the sliced data
            setTimeout(async () => {
                try {
                    // Look for generated files in temp directory
                    const files = await fs.readdir(outputDir);
                    const gcodeFile = files.find(f => f.endsWith('.gcode') || f.endsWith('.3mf'));
                    
                    if (gcodeFile) {
                        const gcodeContent = await fs.readFile(path.join(outputDir, gcodeFile), 'utf8');
                        const result = this.parseGcode(gcodeContent, density);
                        resolve(result);
                    } else {
                        reject(new Error('No G-code file generated'));
                    }
                } catch (error) {
                    reject(error);
                } finally {
                    // Clean up process
                    bambuProcess.kill();
                }
            }, 15000); // Wait 15 seconds for slicing
        });
    }

    parseGcode(gcodeContent, density) {
        const result = {
            filamentUsed: 0,      // in mm
            filamentWeight: 0,    // in grams
            printTime: 0,         // in hours
            layers: 0,
            supportWeight: 0,     // in grams
            partWeight: 0,        // in grams
            totalWeight: 0,       // in grams
            method: 'gcode'
        };

        // Parse filament usage from G-code comments
        // Bambu Studio format: ; filament_used[0] = 1234.56mm
        const filamentMatch = gcodeContent.match(/;\s*filament_used\[0\]\s*=\s*([\d.]+)mm/);
        if (filamentMatch) {
            result.filamentUsed = parseFloat(filamentMatch[1]);
        }

        // Alternative format: ; Filament used: 1234.56mm
        const altFilamentMatch = gcodeContent.match(/;\s*Filament used:\s*([\d.]+)\s*mm/i);
        if (!result.filamentUsed && altFilamentMatch) {
            result.filamentUsed = parseFloat(altFilamentMatch[1]);
        }

        // Parse weight directly if available
        // ; filament_weight[0] = 12.34g
        const weightMatch = gcodeContent.match(/;\s*filament_weight\[0\]\s*=\s*([\d.]+)g/);
        if (weightMatch) {
            result.filamentWeight = parseFloat(weightMatch[1]);
        }

        // Calculate weight from filament length if not directly available
        if (!result.filamentWeight && result.filamentUsed > 0) {
            const diameter = 1.75; // mm
            const radius = diameter / 2;
            const volumeMm3 = Math.PI * radius * radius * result.filamentUsed;
            const volumeCm3 = volumeMm3 / 1000;
            result.filamentWeight = volumeCm3 * density;
        }

        // Parse print time
        // ; estimated printing time = 1h 23m 45s
        const timeMatch = gcodeContent.match(/;\s*estimated printing time\s*=\s*(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/i);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1] || 0);
            const minutes = parseInt(timeMatch[2] || 0);
            const seconds = parseInt(timeMatch[3] || 0);
            result.printTime = hours + minutes / 60 + seconds / 3600;
        }

        // Alternative time format: ; Print time: 5040 (seconds)
        const altTimeMatch = gcodeContent.match(/;\s*Print time:\s*(\d+)/i);
        if (!result.printTime && altTimeMatch) {
            result.printTime = parseInt(altTimeMatch[1]) / 3600;
        }

        // Count layers
        const layerMatches = gcodeContent.match(/;LAYER:\d+/g);
        if (layerMatches) {
            result.layers = layerMatches.length;
        }

        // Parse support material weight if available
        // ; support_material_used[0] = 123.45mm
        const supportMatch = gcodeContent.match(/;\s*support_material_used\[0\]\s*=\s*([\d.]+)mm/);
        if (supportMatch) {
            const supportLength = parseFloat(supportMatch[1]);
            const diameter = 1.75;
            const radius = diameter / 2;
            const volumeMm3 = Math.PI * radius * radius * supportLength;
            const volumeCm3 = volumeMm3 / 1000;
            result.supportWeight = volumeCm3 * density;
        }

        // Estimate support weight if not available (typically 10-20% of total for supported prints)
        if (!result.supportWeight && gcodeContent.includes('support')) {
            result.supportWeight = result.filamentWeight * 0.15;
        }

        // Calculate part weight and total
        result.partWeight = result.filamentWeight - result.supportWeight;
        result.totalWeight = result.filamentWeight;

        return result;
    }

    parseBambuOutput(output, density) {
        // Parse Bambu Studio console output
        const result = {
            filamentUsed: 0,
            filamentWeight: 0,
            printTime: 0,
            layers: 0,
            supportWeight: 0,
            partWeight: 0,
            totalWeight: 0,
            method: 'bambu'
        };

        // Look for filament usage in output
        const patterns = [
            /Filament used:\s*([\d.]+)\s*mm/i,
            /Filament length:\s*([\d.]+)\s*mm/i,
            /Total filament:\s*([\d.]+)\s*mm/i
        ];

        for (const pattern of patterns) {
            const match = output.match(pattern);
            if (match) {
                result.filamentUsed = parseFloat(match[1]);
                break;
            }
        }

        // Look for weight
        const weightPatterns = [
            /Filament weight:\s*([\d.]+)\s*g/i,
            /Material weight:\s*([\d.]+)\s*g/i,
            /Total weight:\s*([\d.]+)\s*g/i
        ];

        for (const pattern of weightPatterns) {
            const match = output.match(pattern);
            if (match) {
                result.filamentWeight = parseFloat(match[1]);
                break;
            }
        }

        // Calculate weight if we have length but not weight
        if (result.filamentUsed > 0 && result.filamentWeight === 0) {
            const diameter = 1.75;
            const radius = diameter / 2;
            const volumeMm3 = Math.PI * radius * radius * result.filamentUsed;
            const volumeCm3 = volumeMm3 / 1000;
            result.filamentWeight = volumeCm3 * density;
        }

        // Parse print time
        const timePatterns = [
            /Print time:\s*(\d+)\s*hours?\s*(\d+)\s*minutes?/i,
            /Estimated time:\s*(\d+):(\d+):(\d+)/i,
            /Time:\s*([\d.]+)\s*hours?/i
        ];

        for (const pattern of timePatterns) {
            const match = output.match(pattern);
            if (match) {
                if (match[3]) {
                    // HH:MM:SS format
                    result.printTime = parseInt(match[1]) + parseInt(match[2]) / 60 + parseInt(match[3]) / 3600;
                } else if (match[2]) {
                    // Hours and minutes
                    result.printTime = parseInt(match[1]) + parseInt(match[2]) / 60;
                } else {
                    // Just hours
                    result.printTime = parseFloat(match[1]);
                }
                break;
            }
        }

        // Estimate support and part weights
        if (output.toLowerCase().includes('support')) {
            result.supportWeight = result.filamentWeight * 0.15;
            result.partWeight = result.filamentWeight * 0.85;
        } else {
            result.supportWeight = 0;
            result.partWeight = result.filamentWeight;
        }

        result.totalWeight = result.filamentWeight;

        return result;
    }

    async parseExistingGcode(filePath, options, density) {
        // Check if there's already a sliced file for this STL
        const dir = path.dirname(filePath);
        const basename = path.basename(filePath, path.extname(filePath));
        
        const possibleGcodes = [
            path.join(dir, `${basename}.gcode`),
            path.join(dir, `${basename}.gcode.3mf`),
            path.join(dir, `${basename}_plate_1.gcode`),
        ];

        for (const gcodePath of possibleGcodes) {
            try {
                const content = await fs.readFile(gcodePath, 'utf8');
                console.log(`Found existing G-code: ${gcodePath}`);
                return this.parseGcode(content, density);
            } catch {
                // File doesn't exist, try next
            }
        }

        return null;
    }

    async advancedEstimation(filePath, options, density) {
        // Advanced estimation using Bambu's typical slicing parameters
        const File3DAnalyzer = require('./3d-file-analyzer');
        const analyzer = new File3DAnalyzer();
        
        const analysis = await analyzer.analyzeFile(filePath, options);
        
        // Bambu-specific adjustments
        const infillDensity = options.infill || 15;
        const wallLoops = options.profile === 'quality' ? 3 : 2;
        const layerHeight = options.layerHeight || 0.2;
        
        // Calculate shell volume (walls + top/bottom)
        const wallThickness = wallLoops * 0.4; // nozzle diameter
        const shellVolume = analysis.surfaceArea * wallThickness / 10; // Convert to cm³
        
        // Calculate infill volume
        const infillVolume = analysis.volume * (infillDensity / 100) * 0.9; // 90% of internal volume
        
        // Calculate support volume if needed
        let supportVolume = 0;
        if (options.supportEnabled) {
            // Estimate based on overhangs and bridges
            supportVolume = analysis.volume * 0.05; // Rough estimate: 5% of total volume
        }
        
        // Total volume and weight
        const totalVolume = shellVolume + infillVolume + supportVolume;
        const totalWeight = totalVolume * density;
        
        // Calculate print time (Bambu printers are fast)
        const layerCount = Math.ceil(analysis.dimensions.z / layerHeight);
        const printSpeed = options.profile === 'draft' ? 200 : options.profile === 'quality' ? 100 : 150;
        
        // Time calculation considering Bambu's efficiency
        const baseTime = (totalVolume * 60) / (printSpeed * 0.4 * layerHeight); // minutes
        const travelTime = layerCount * 0.1; // 6 seconds per layer for travels
        const totalTime = (baseTime + travelTime) / 60; // Convert to hours
        
        return {
            filamentUsed: (totalVolume * 1000) / (Math.PI * 0.875 * 0.875), // Convert to mm of filament
            filamentWeight: totalWeight,
            printTime: totalTime,
            layers: layerCount,
            supportWeight: supportVolume * density,
            partWeight: (shellVolume + infillVolume) * density,
            totalWeight: totalWeight,
            method: 'advanced_estimation'
        };
    }

    async getSlicerStatus() {
        return {
            bambuStudio: !!this.bambuPath,
            bambuCLI: !!this.bambuCliPath,
            path: this.bambuPath || this.bambuCliPath || 'Not found',
            profilesAvailable: ['standard', 'quality', 'draft']
        };
    }
}

module.exports = BambuSlicerIntegration;