// Slicer Integration Module
// Integrates with PrusaSlicer CLI or other slicing engines to get accurate weight data

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);
const BambuSlicerIntegration = require('./bambu-slicer-integration');

class SlicerIntegration {
    constructor() {
        // Initialize Bambu slicer
        this.bambuSlicer = new BambuSlicerIntegration();
        
        // Try to find slicer executables
        this.slicers = {
            prusaSlicer: {
                windows: [
                    'C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe',
                    'C:\\Program Files (x86)\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe',
                    'prusa-slicer-console.exe'
                ],
                command: null,
                profiles: {
                    standard: 'config/prusaslicer-standard.ini',
                    quality: 'config/prusaslicer-quality.ini',
                    draft: 'config/prusaslicer-draft.ini'
                }
            },
            bambuStudio: {
                windows: [
                    'C:\\Program Files\\Bambu Studio\\bambu-studio-console.exe',
                    'C:\\Program Files (x86)\\Bambu Studio\\bambu-studio-console.exe',
                    'bambu-studio.exe'
                ],
                command: null,
                profiles: {
                    standard: 'config/bambu-standard.json',
                    quality: 'config/bambu-quality.json',
                    draft: 'config/bambu-draft.json'
                }
            },
            cura: {
                windows: [
                    'C:\\Program Files\\Ultimaker Cura\\CuraEngine.exe',
                    'C:\\Program Files (x86)\\Ultimaker Cura\\CuraEngine.exe',
                    'CuraEngine.exe'
                ],
                command: null,
                profiles: {
                    standard: 'config/cura-standard.json',
                    quality: 'config/cura-quality.json',
                    draft: 'config/cura-draft.json'
                }
            }
        };

        this.tempDir = path.join(__dirname, '..', 'temp-slicing');
        this.configDir = path.join(__dirname, '..', 'config');
        this.initializeSlicers();
    }

    async initializeSlicers() {
        // Create temp directory if it doesn't exist
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
            await fs.mkdir(this.configDir, { recursive: true });
        } catch (error) {
            console.error('Error creating directories:', error);
        }

        // Find available slicers
        for (const [slicerName, slicer] of Object.entries(this.slicers)) {
            for (const possiblePath of slicer.windows) {
                try {
                    await fs.access(possiblePath);
                    slicer.command = possiblePath;
                    console.log(`Found ${slicerName} at: ${possiblePath}`);
                    break;
                } catch {
                    // Try next path
                }
            }
        }

        // Create default config files if they don't exist
        await this.createDefaultConfigs();
    }

    async createDefaultConfigs() {
        // PrusaSlicer config
        const prusaConfig = `
# PrusaSlicer config for accurate weight calculation
layer_height = 0.2
first_layer_height = 0.2
perimeters = 3
spiral_vase = 0
top_solid_layers = 5
bottom_solid_layers = 4
fill_density = 20%
fill_pattern = gyroid
support_material = 1
support_material_auto = 1
support_material_threshold = 45
support_material_pattern = rectilinear
support_material_spacing = 2
support_material_angle = 0
support_material_interface_layers = 2
support_material_density = 15%
raft_layers = 0
skirts = 1
skirt_distance = 2
skirt_height = 1
min_skirt_length = 4
brim_width = 0
filament_diameter = 1.75
filament_density = 1.24
nozzle_diameter = 0.4
bed_shape = 0x0,256x0,256x256,0x256
gcode_flavor = marlin
`;

        const prusaStandardPath = path.join(this.configDir, 'prusaslicer-standard.ini');
        try {
            await fs.access(prusaStandardPath);
        } catch {
            await fs.writeFile(prusaStandardPath, prusaConfig);
            console.log('Created PrusaSlicer standard config');
        }

        // Bambu Studio config (JSON format)
        const bambuConfig = {
            "layer_height": 0.2,
            "initial_layer_height": 0.2,
            "wall_loops": 3,
            "sparse_infill_density": "20%",
            "sparse_infill_pattern": "grid",
            "top_shell_layers": 5,
            "bottom_shell_layers": 4,
            "enable_support": true,
            "support_type": "normal(auto)",
            "support_threshold_angle": 45,
            "support_base_pattern": "default",
            "support_density": "15%",
            "support_interface_layers": 2,
            "enable_raft": false,
            "skirt_loops": 1,
            "skirt_distance": 2,
            "brim_width": 0,
            "filament_diameter": 1.75,
            "filament_density": 1.24,
            "nozzle_diameter": 0.4,
            "bed_size": "256x256",
            "filament_type": "PLA"
        };

        const bambuStandardPath = path.join(this.configDir, 'bambu-standard.json');
        try {
            await fs.access(bambuStandardPath);
        } catch {
            await fs.writeFile(bambuStandardPath, JSON.stringify(bambuConfig, null, 2));
            console.log('Created Bambu Studio standard config');
        }
    }

    async sliceFile(filePath, options = {}) {
        const {
            material = 'PLA',
            profile = 'standard',
            printer = 'Bambu X1C',
            infill = 20,
            supportEnabled = 'auto',
            layerHeight = 0.2
        } = options;

        // Try slicing with available slicers
        let result = null;

        // Try Bambu slicer first (most accurate for Bambu printers)
        try {
            result = await this.bambuSlicer.sliceWithBambuStudio(filePath, options);
            if (result && result.filamentWeight > 0) {
                console.log(`✅ Sliced with Bambu Studio: ${result.filamentWeight.toFixed(1)}g filament`);
                return result;
            }
        } catch (error) {
            console.error('Bambu slicer failed:', error.message);
        }

        // Try PrusaSlicer as fallback
        if (this.slicers.prusaSlicer.command) {
            try {
                result = await this.sliceWithPrusaSlicer(filePath, options);
                if (result) return result;
            } catch (error) {
                console.error('PrusaSlicer failed:', error.message);
            }
        }

        // Try legacy Bambu Studio method
        if (this.slicers.bambuStudio.command) {
            try {
                result = await this.sliceWithBambuStudio(filePath, options);
                if (result) return result;
            } catch (error) {
                console.error('Legacy Bambu Studio failed:', error.message);
            }
        }

        // Fallback to web-based slicer API
        try {
            result = await this.sliceWithWebAPI(filePath, options);
            if (result) return result;
        } catch (error) {
            console.error('Web API slicing failed:', error.message);
        }

        // If all slicers fail, use enhanced estimation
        return this.estimateSlicedWeight(filePath, options);
    }

    async sliceWithPrusaSlicer(filePath, options) {
        const outputPath = path.join(this.tempDir, `${Date.now()}.gcode`);
        const configPath = path.join(this.configDir, 'prusaslicer-standard.ini');

        // Build command
        const command = `"${this.slicers.prusaSlicer.command}" --slice "${filePath}" --load "${configPath}" --output "${outputPath}" --info`;

        try {
            const { stdout, stderr } = await execPromise(command);
            
            // Parse output for weight information
            const weight = this.parsePrusaSlicerOutput(stdout + stderr);
            
            // Clean up temp file
            try {
                await fs.unlink(outputPath);
            } catch {}

            return weight;
        } catch (error) {
            throw new Error(`PrusaSlicer execution failed: ${error.message}`);
        }
    }

    parsePrusaSlicerOutput(output) {
        const result = {
            filamentUsed: 0,
            filamentWeight: 0,
            printTime: 0,
            layers: 0,
            supportWeight: 0,
            partWeight: 0,
            totalWeight: 0
        };

        // Parse filament usage (in mm)
        const filamentMatch = output.match(/filament used.*?(\d+\.?\d*)\s*mm/i);
        if (filamentMatch) {
            result.filamentUsed = parseFloat(filamentMatch[1]);
        }

        // Parse filament weight (in g)
        const weightMatch = output.match(/filament used.*?(\d+\.?\d*)\s*g/i);
        if (weightMatch) {
            result.filamentWeight = parseFloat(weightMatch[1]);
        } else if (result.filamentUsed > 0) {
            // Calculate weight from length if not provided
            // Volume = π * (d/2)² * length
            const diameter = 1.75; // mm
            const density = 1.24; // g/cm³ for PLA
            const volume = Math.PI * Math.pow(diameter / 2, 2) * result.filamentUsed; // mm³
            result.filamentWeight = (volume / 1000) * density; // Convert to cm³ and multiply by density
        }

        // Parse print time
        const timeMatch = output.match(/estimated printing time.*?(\d+)h\s*(\d+)m/i);
        if (timeMatch) {
            result.printTime = parseInt(timeMatch[1]) + parseInt(timeMatch[2]) / 60;
        }

        // Parse layer count
        const layerMatch = output.match(/(\d+)\s*layers/i);
        if (layerMatch) {
            result.layers = parseInt(layerMatch[1]);
        }

        // Estimate support vs part weight (approximate)
        // This is a rough estimate - actual slicer may provide this
        const supportPercentage = output.includes('support_material = 1') ? 0.15 : 0;
        result.supportWeight = result.filamentWeight * supportPercentage;
        result.partWeight = result.filamentWeight * (1 - supportPercentage);
        result.totalWeight = result.filamentWeight;

        return result;
    }

    async sliceWithBambuStudio(filePath, options) {
        // Bambu Studio CLI integration
        // Note: Bambu Studio may not have full CLI support yet
        // This is a placeholder for when it becomes available
        
        const outputPath = path.join(this.tempDir, `${Date.now()}.gcode`);
        const configPath = path.join(this.configDir, 'bambu-standard.json');

        const command = `"${this.slicers.bambuStudio.command}" --export-gcode --load-config "${configPath}" --output "${outputPath}" "${filePath}"`;

        try {
            const { stdout, stderr } = await execPromise(command);
            
            // Parse Bambu Studio output
            const weight = this.parseBambuOutput(stdout + stderr);
            
            // Clean up
            try {
                await fs.unlink(outputPath);
            } catch {}

            return weight;
        } catch (error) {
            throw new Error(`Bambu Studio execution failed: ${error.message}`);
        }
    }

    parseBambuOutput(output) {
        // Similar to PrusaSlicer parsing but adapted for Bambu Studio output format
        return this.parsePrusaSlicerOutput(output);
    }

    async sliceWithWebAPI(filePath, options) {
        // Use a web-based slicing service
        // Options: Kiri:Moto API, OctoPrint slicer, or custom service
        
        try {
            const fileBuffer = await fs.readFile(filePath);
            const formData = new FormData();
            formData.append('file', new Blob([fileBuffer]), path.basename(filePath));
            formData.append('profile', options.profile || 'standard');
            formData.append('infill', options.infill || 20);
            formData.append('support', options.supportEnabled || 'auto');

            // Example: Using a hypothetical slicing API
            const response = await fetch('https://api.slicing-service.com/slice', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Web API slicing failed');
            }

            const result = await response.json();
            
            return {
                filamentWeight: result.weight || 0,
                supportWeight: result.supportWeight || 0,
                partWeight: result.partWeight || 0,
                totalWeight: result.totalWeight || 0,
                printTime: result.printTime || 0,
                layers: result.layers || 0
            };
        } catch (error) {
            throw new Error(`Web API slicing failed: ${error.message}`);
        }
    }

    async estimateSlicedWeight(filePath, options) {
        // Enhanced weight estimation when slicers are not available
        // This uses more sophisticated calculations
        
        const File3DAnalyzer = require('./3d-file-analyzer');
        const analyzer = new File3DAnalyzer();
        
        try {
            const analysis = await analyzer.analyzeFile(filePath, options);
            
            // Use the enhanced calculation from the analyzer
            const metrics = analysis.metrics;
            
            return {
                filamentWeight: parseFloat(metrics.weight.total),
                supportWeight: parseFloat(metrics.weight.support),
                partWeight: parseFloat(metrics.weight.part),
                totalWeight: parseFloat(metrics.weight.slicedPerPart),
                printTime: parseFloat(metrics.printTime.perPart),
                layers: Math.ceil(analysis.dimensions.z / 0.2),
                method: 'estimation'
            };
        } catch (error) {
            throw new Error(`Estimation failed: ${error.message}`);
        }
    }

    async getSlicerStatus() {
        const status = {};
        
        for (const [name, slicer] of Object.entries(this.slicers)) {
            status[name] = {
                available: !!slicer.command,
                path: slicer.command || 'Not found'
            };
        }
        
        return status;
    }
}

module.exports = SlicerIntegration;