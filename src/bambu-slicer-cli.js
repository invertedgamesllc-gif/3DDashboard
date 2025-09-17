const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const PrusaSlicerDownloader = require('./prusa-slicer-downloader');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const { calculatePrintMetrics } = require('./print-calculations');

class BambuSlicerCLI {
    constructor() {
        // PrusaSlicer paths (which supports CLI)
        this.prusaSlicerPaths = [
            'C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe',
            'C:\\Program Files\\PrusaSlicer\\prusa-slicer-console.exe',
            'C:\\Program Files (x86)\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe',
            path.join(os.homedir(), 'AppData\\Local\\Programs\\PrusaSlicer\\prusa-slicer-console.exe')
        ];
        
        this.slicerPath = null;
        this.tempDir = path.join(os.tmpdir(), 'bambu-slicer');
        this.configDir = path.join(__dirname, '..', 'slicer-profiles');
        this.initialized = false;
    }

    async initialize() {
        // First try to find existing PrusaSlicer installation
        for (const possiblePath of this.prusaSlicerPaths) {
            try {
                await fs.access(possiblePath);
                this.slicerPath = possiblePath;
                console.log('✅ Found PrusaSlicer at:', possiblePath);
                break;
            } catch (error) {
                // Path doesn't exist, try next
            }
        }

        // If not found, download portable version
        if (!this.slicerPath) {
            console.log('⚠️ PrusaSlicer not found. Downloading portable version...');
            try {
                const downloader = new PrusaSlicerDownloader();
                this.slicerPath = await downloader.ensureInstalled();
                console.log('✅ PrusaSlicer ready at:', this.slicerPath);
            } catch (error) {
                console.error('Failed to download PrusaSlicer:', error);
                console.warn('Falling back to estimation mode.');
            }
        }
        
        // Create config directory for profiles
        try {
            await fs.mkdir(this.configDir, { recursive: true });
            await this.createBambuProfile();
        } catch (error) {
            console.error('Failed to create config directory:', error);
        }

        // Create temp directory for slicing
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create temp directory:', error);
        }

        this.initialized = true;
        return true;
    }

    async sliceFile(filePath, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        // Try PrusaSlicer first if available
        if (this.slicerPath) {
            try {
                const result = await this.sliceWithPrusaSlicer(filePath, options);
                if (result.success) {
                    return result;
                }
            } catch (error) {
                console.error('PrusaSlicer failed, falling back to estimation:', error);
            }
        }
        
        // Fall back to estimation
        console.log('Using advanced estimation mode');
        console.log('File path:', filePath);
        
        try {
            const stats = await fs.stat(filePath);
            const fileSizeMB = stats.size / (1024 * 1024);
            console.log('File size (MB):', fileSizeMB.toFixed(2));
            
            // Read file extension
            const ext = path.extname(filePath).toLowerCase();
            console.log('File extension:', ext);
            
            if (ext === '.stl') {
                // For STL files, we can read and calculate volume
                const fileBuffer = await fs.readFile(filePath);
                const result = await this.analyzeSTL(fileBuffer);
                return result;
            } else if (ext === '.3mf') {
                // For 3MF files, try proper parsing first, fallback to estimation
                console.log('📦 Processing 3MF file:', filePath);
                try {
                    const result = await this.analyze3MFFile(filePath);
                    console.log('✅ 3MF parsing successful');
                    return result;
                } catch (error) {
                    console.error('❌ 3MF parsing failed:', error.message);
                    console.error('Stack trace:', error.stack);
                    
                    // Improved fallback estimation for 3MF files
                    // 3MF files are highly compressed, typical ratios:
                    // Small models (< 2MB): ~2000-3000 mm³/MB
                    // Medium models (2-10MB): ~3000-5000 mm³/MB  
                    // Large models (> 10MB): ~5000-8000 mm³/MB
                    let volumePerMB = 3500; // Default for medium files
                    if (fileSizeMB < 2) {
                        volumePerMB = 2500;
                    } else if (fileSizeMB > 10) {
                        volumePerMB = 6000;
                    } else if (fileSizeMB > 5) {
                        volumePerMB = 4500;
                    }
                    
                    const estimatedVolume = fileSizeMB * volumePerMB;
                    const weight = (estimatedVolume / 1000) * 0.736; // Using calibrated density
                    const printTime = Math.round(weight * 3.45); // 3.45 min/gram
                    
                    return {
                        success: true,
                        weight: weight,
                        printTime: printTime,
                        filamentLength: weight * 330,
                        layerCount: Math.round(estimatedVolume / (50 * 50 * 0.2)), // Estimate based on 50x50mm base and 0.2mm layers
                        supportWeight: weight * 0.15, // Assume 15% support material for unknown geometry
                        dimensions: { 
                            x: Math.round(Math.pow(estimatedVolume * 2, 1/3)), 
                            y: Math.round(Math.pow(estimatedVolume * 2, 1/3)), 
                            z: Math.round(Math.pow(estimatedVolume, 1/3)) 
                        },
                        parsing: 'fallback'
                    };
                }
            } else {
                // For other file types (OBJ, etc), use basic estimation
                const estimatedVolume = fileSizeMB * 5000; // mm³ per MB (conservative estimate)
                const weight = (estimatedVolume / 1000) * 0.736; // Using calibrated density
                const printTime = Math.round(weight * 3.45); // 3.45 min/gram
                
                return {
                    success: true,
                    weight: weight,
                    printTime: printTime,
                    filamentLength: weight * 330,
                    layerCount: 200,
                    supportWeight: weight * 0.15,
                    dimensions: { x: 80, y: 80, z: 40 }
                };
            }
        } catch (error) {
            console.error('Error analyzing file:', error);
            throw error;
        }
    }

    async analyzeSTL(buffer) {
        // Check if binary or ASCII STL
        const isAscii = String.fromCharCode.apply(null, new Uint8Array(buffer, 0, 5)) === 'solid';
        
        let volume = 0;
        let boundingBox = { x: 0, y: 0, z: 0 };
        
        if (!isAscii) {
            // Binary STL
            const dataView = new DataView(buffer.buffer || buffer);
            const triangleCount = dataView.getUint32(80, true);
            
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            
            for (let i = 0; i < triangleCount; i++) {
                const offset = 84 + (i * 50);
                
                // Read vertices
                for (let v = 0; v < 3; v++) {
                    const vOffset = offset + 12 + (v * 12);
                    const x = dataView.getFloat32(vOffset, true);
                    const y = dataView.getFloat32(vOffset + 4, true);
                    const z = dataView.getFloat32(vOffset + 8, true);
                    
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    minZ = Math.min(minZ, z);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                    maxZ = Math.max(maxZ, z);
                    
                    if (v === 0) {
                        // Calculate volume using first vertex of each triangle
                        const v2Offset = offset + 12 + 12;
                        const v3Offset = offset + 12 + 24;
                        
                        const x2 = dataView.getFloat32(v2Offset, true);
                        const y2 = dataView.getFloat32(v2Offset + 4, true);
                        const z2 = dataView.getFloat32(v2Offset + 8, true);
                        
                        const x3 = dataView.getFloat32(v3Offset, true);
                        const y3 = dataView.getFloat32(v3Offset + 4, true);
                        const z3 = dataView.getFloat32(v3Offset + 8, true);
                        
                        // Signed volume calculation
                        const signedVolume = 
                            x * (y2 * z3 - y3 * z2) -
                            x2 * (y * z3 - y3 * z) +
                            x3 * (y * z2 - y2 * z);
                        
                        volume += signedVolume / 6.0;
                    }
                }
            }
            
            volume = Math.abs(volume);
            boundingBox = {
                x: maxX - minX,
                y: maxY - minY,
                z: maxZ - minZ
            };
        }
        
        // Calculate weight using calibrated values
        const volumeCm3 = volume / 1000;
        const weight = volumeCm3 * 0.736; // Calibrated density
        const printTime = Math.round(weight * 3.45); // 3.45 min/gram
        
        return {
            success: true,
            weight: weight,
            printTime: printTime,
            filamentLength: Math.round(weight * 330),
            layerCount: Math.ceil(boundingBox.z / 0.2),
            layerHeight: 0.2,
            supportWeight: 0,
            dimensions: boundingBox,
            filamentType: 'PLA',
            infillPercentage: 15
        };
    }

    extractGcodeMetadata(gcodeContent) {
        const lines = gcodeContent.split('\n').slice(0, 3000);
        const metadata = {
            weight: 0,
            printTime: 0,
            filamentLength: 0,
            layerCount: 0,
            layerHeight: 0.2,
            supportWeight: 0,
            dimensions: { x: 0, y: 0, z: 0 },
            filamentType: 'PLA',
            printerModel: '',
            infillPercentage: 15
        };

        for (const line of lines) {
            // Weight extraction
            if (line.includes('filament used [g]')) {
                const match = line.match(/=\s*([\d.]+)/);
                if (match) metadata.weight = parseFloat(match[1]);
            }
            
            // Print time
            if (line.includes('estimated printing time')) {
                const match = line.match(/=\s*(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/);
                if (match) {
                    const hours = parseInt(match[1] || 0);
                    const minutes = parseInt(match[2] || 0);
                    metadata.printTime = hours * 60 + minutes;
                }
            }
            
            // Other metadata extraction...
        }

        return metadata;
    }

    async createBambuProfile() {
        // Create a Bambu X1C profile for PrusaSlicer
        const profileContent = `
# Bambu Lab X1 Carbon Profile
[print:Bambu X1C 0.2mm]
inherits = *common*
layer_height = 0.2
first_layer_height = 0.2
perimeters = 2
fill_density = 15%
fill_pattern = gyroid
print_speed = 150
travel_speed = 350
first_layer_speed = 50
nozzle_diameter = 0.4
filament_diameter = 1.75
temperature = 220
bed_temperature = 60
support_material = 0
support_material_auto = 1

[printer:Bambu X1C]
bed_shape = 0x0,256x0,256x256,0x256
max_print_height = 250

[filament:PLA]
filament_type = PLA
filament_density = 1.24
filament_cost = 20
temperature = 220
bed_temperature = 60
`;
        
        const profilePath = path.join(this.configDir, 'bambu_x1c.ini');
        try {
            await fs.writeFile(profilePath, profileContent);
            console.log('Created Bambu profile at:', profilePath);
        } catch (error) {
            console.error('Failed to create profile:', error);
        }
    }
    
    async sliceWithPrusaSlicer(filePath, options = {}) {
        const outputPath = path.join(this.tempDir, 'output.gcode');
        const profilePath = path.join(this.configDir, 'bambu_x1c.ini');
        
        // PrusaSlicer command with parameters
        const args = [
            '--slice',
            filePath,
            '--output', outputPath,
            '--load', profilePath,
            '--fill-density', '15%',
            '--layer-height', '0.2',
            '--first-layer-height', '0.2',
            '--nozzle-diameter', '0.4',
            '--filament-diameter', '1.75',
            '--temperature', '220',
            '--bed-temperature', '60',
            '--print-speed', '150',
            '--travel-speed', '350'
        ];
        
        return new Promise((resolve, reject) => {
            console.log('Running PrusaSlicer with args:', args.join(' '));
            
            const process = spawn(this.slicerPath, args);
            let stdout = '';
            let stderr = '';
            
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            process.on('close', async (code) => {
                if (code !== 0) {
                    console.error('PrusaSlicer failed:', stderr);
                    reject(new Error(`PrusaSlicer exited with code ${code}`));
                    return;
                }
                
                try {
                    // Read the generated G-code
                    const gcodeContent = await fs.readFile(outputPath, 'utf8');
                    const metadata = this.extractPrusaSlicerMetadata(gcodeContent);
                    
                    // Clean up
                    await fs.unlink(outputPath).catch(() => {});
                    
                    resolve({
                        success: true,
                        weight: metadata.weight,
                        printTime: metadata.printTime,
                        filamentLength: metadata.filamentLength,
                        layerCount: metadata.layerCount,
                        layerHeight: 0.2,
                        supportWeight: metadata.supportWeight,
                        dimensions: metadata.dimensions,
                        filamentType: 'PLA',
                        infillPercentage: 15
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
    
    extractPrusaSlicerMetadata(gcodeContent) {
        const lines = gcodeContent.split('\n').slice(0, 500);
        const metadata = {
            weight: 0,
            printTime: 0,
            filamentLength: 0,
            layerCount: 0,
            supportWeight: 0,
            dimensions: { x: 0, y: 0, z: 0 }
        };

        for (const line of lines) {
            // PrusaSlicer format: ; filament used [g] = X.XX
            if (line.includes('filament used [g]')) {
                const match = line.match(/=\s*([\d.]+)/);
                if (match) metadata.weight = parseFloat(match[1]);
            }
            
            // ; filament used [mm] = X
            if (line.includes('filament used [mm]')) {
                const match = line.match(/=\s*([\d.]+)/);
                if (match) metadata.filamentLength = parseFloat(match[1]);
            }
            
            // ; estimated printing time = Xh Ym Zs
            if (line.includes('estimated printing time')) {
                const match = line.match(/=\s*(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/);
                if (match) {
                    const hours = parseInt(match[1] || 0);
                    const minutes = parseInt(match[2] || 0);
                    metadata.printTime = hours * 60 + minutes;
                }
            }
            
            // ; total layers count = X
            if (line.includes('total layers count')) {
                const match = line.match(/=\s*(\d+)/);
                if (match) metadata.layerCount = parseInt(match[1]);
            }
        }

        return metadata;
    }

    async analyze3MFFile(filePath) {
        console.log('🔍 Analyzing 3MF file with proper parsing...');
        
        try {
            const zip = new AdmZip(filePath);
            const entries = zip.getEntries();
            
            let modelData = null;
            let metadata = {};
            let materials = [];
            let componentFiles = {};
            
            // First pass: Load all component files
            for (const entry of entries) {
                if (entry.entryName.includes('/Objects/') && entry.entryName.endsWith('.model')) {
                    console.log('📦 Found component file:', entry.entryName);
                    const content = zip.readAsText(entry);
                    const parser = new xml2js.Parser();
                    try {
                        const result = await parser.parseStringPromise(content);
                        // Store with both possible path formats
                        componentFiles['/' + entry.entryName] = result;
                        componentFiles[entry.entryName] = result;
                    } catch (e) {
                        console.warn(`Could not parse component ${entry.entryName}:`, e.message);
                    }
                }
            }
            
            // Second pass: Parse main model and metadata
            for (const entry of entries) {
                if (entry.entryName === '3D/3dmodel.model') {
                    console.log('📄 Found main model file:', entry.entryName);
                    const content = zip.readAsText(entry);
                    const parser = new xml2js.Parser();
                    const result = await parser.parseStringPromise(content);
                    
                    // Check for metadata in the model itself
                    if (result.model && result.model.metadata) {
                        result.model.metadata.forEach(meta => {
                            if (meta.$ && meta.$.name) {
                                metadata[meta.$.name] = meta._;
                            }
                        });
                    }
                    
                    modelData = this.parse3MFModel(result, componentFiles);
                    modelData.metadata = metadata; // Pass metadata to result
                } else if ((entry.entryName.includes('metadata') || entry.entryName.includes('.xml')) && 
                          !entry.entryName.includes('.model') && !entry.entryName.includes('.rels')) {
                    console.log('📋 Found metadata:', entry.entryName);
                    // Handle metadata files
                    const content = zip.readAsText(entry);
                    try {
                        const parser = new xml2js.Parser();
                        const metaResult = await parser.parseStringPromise(content);
                        metadata = { ...metadata, ...metaResult };
                    } catch (e) {
                        // Metadata might be in different format
                        console.warn('Could not parse metadata XML:', e.message);
                    }
                }
            }
            
            if (!modelData || !modelData.volume || modelData.volume <= 0) {
                throw new Error('Could not extract valid geometry from 3MF file');
            }
            
            // Check for multi-color/wipe tower information
            let hasWipeTower = false;
            let colorCount = 1;
            let detectedColors = [];
            let filamentColors = [];
            
            // Parse config files for color information
            for (const entry of entries) {
                if (entry.entryName.includes('.config')) {
                    const configContent = zip.readAsText(entry);
                    
                    // Look for filament colors
                    const colorMatch = configContent.match(/filament_colour\s*=\s*([^\n]+)/);
                    if (colorMatch) {
                        const colors = colorMatch[1]
                            .replace(/["]/g, '')
                            .split(';')
                            .filter(c => c && c.trim() && c !== '');
                        
                        if (colors.length > 0) {
                            filamentColors = colors;
                            colorCount = Math.max(colorCount, colors.length);
                            console.log(`🎨 Found ${colors.length} filament colors in config`);
                        }
                    }
                    
                    // Also check extruder colors
                    const extruderMatch = configContent.match(/extruder_colour\s*=\s*([^\n]+)/);
                    if (extruderMatch) {
                        const extruders = extruderMatch[1]
                            .replace(/["]/g, '')
                            .split(';')
                            .filter(c => c && c.trim() && c !== '');
                        
                        if (extruders.length > 1) {
                            colorCount = Math.max(colorCount, extruders.length);
                        }
                    }
                }
            }
            
            // Check for wipe tower metadata
            for (const entryName in metadata) {
                if (entryName.includes('wipe_tower') || entryName.includes('Prusa_Slicer_wipe_tower')) {
                    hasWipeTower = true;
                    console.log('🗼 Detected wipe tower - multi-color print');
                }
            }
            
            // Check for PrusaSlicer multi-material painting
            if (modelData.metadata && modelData.metadata['slic3rpe:MmPaintingVersion']) {
                console.log('🎨 Detected PrusaSlicer multi-material painting');
            }
            
            // Set up detected colors array
            if (colorCount > 1 && filamentColors.length > 0) {
                detectedColors = filamentColors.map((color, idx) => ({
                    color: color,
                    name: `Color ${idx + 1}`,
                    percentage: Math.round(100 / colorCount)
                }));
            }
            
            // Extract Bambu-specific metadata if available
            const bambuMetadata = this.extractBambuMetadata(metadata);
            
            // Calculate metrics using calibrated system
            const volumeCm3 = modelData.volume / 1000;
            const infillPercent = bambuMetadata.infill || 15;
            
            // Use calibrated calculation system
            const metrics = calculatePrintMetrics(
                volumeCm3,
                modelData.dimensions,
                colorCount,
                infillPercent
            );
            
            let weight = metrics.weight;
            let printTime = metrics.time;
            
            // Layer calculation based on actual Z dimension
            const layerHeight = 0.2; // mm
            const layerCount = Math.max(1, Math.round(modelData.dimensions.z / layerHeight));
            
            
            console.log(`✅ 3MF Analysis Complete:`);
            console.log(`   Volume: ${volumeCm3.toFixed(2)} cm³`);
            console.log(`   Dimensions: ${modelData.dimensions.x.toFixed(1)}×${modelData.dimensions.y.toFixed(1)}×${modelData.dimensions.z.toFixed(1)} mm`);
            console.log(`   Weight: ${weight.toFixed(1)}g`);
            console.log(`   Triangles: ${modelData.triangleCount || 'unknown'}`);
            
            // Prepare materials info array
            let materialsInfo = [];
            if (hasWipeTower && colorCount > 1) {
                // For multi-color, distribute weight among colors
                const weightPerColor = parseFloat((weight / colorCount).toFixed(1));
                
                if (detectedColors.length > 0) {
                    materialsInfo = detectedColors.map(color => ({
                        type: 'PLA',
                        color: color.name,
                        hex: color.color,
                        weight: weightPerColor,
                        percentage: color.percentage
                    }));
                } else {
                    // Generic multi-color
                    for (let i = 1; i <= colorCount; i++) {
                        materialsInfo.push({
                            type: 'PLA',
                            color: `Color ${i}`,
                            weight: weightPerColor,
                            percentage: Math.round(100 / colorCount)
                        });
                    }
                }
            } else {
                materialsInfo = [
                    { type: bambuMetadata.filamentType || 'PLA', color: 'Single Color', weight: parseFloat(weight.toFixed(1)), percentage: 100 }
                ];
            }
            
            return {
                success: true,
                weight: parseFloat(weight.toFixed(1)),
                printTime: parseFloat(printTime.toFixed(1)),
                filamentLength: parseFloat((weight * 330).toFixed(1)),
                layerCount: layerCount,
                layerHeight: 0.2,
                supportWeight: 0, // Included in weight calculation
                dimensions: modelData.dimensions,
                filamentType: bambuMetadata.filamentType || 'PLA',
                infillPercentage: bambuMetadata.infill || 15,
                volume: modelData.volume,
                triangleCount: modelData.triangleCount,
                surfaceArea: modelData.surfaceArea,
                parsing: 'successful',
                metadata: bambuMetadata,
                materials: materialsInfo,
                isMultiColor: hasWipeTower,
                colorCount: colorCount
            };
            
        } catch (error) {
            console.error('❌ 3MF parsing error:', error.message);
            throw error;
        }
    }

    parse3MFModel(xmlData, componentFiles = {}) {
        console.log('🔧 Parsing 3MF XML structure...');
        
        const model = xmlData.model;
        if (!model || !model.resources) {
            throw new Error('Invalid 3MF structure: no model or resources found');
        }
        
        // Check for unit specification (default is millimeter)
        const unit = model.$ && model.$.unit ? model.$.unit : 'millimeter';
        let unitScale = 1.0; // Default for millimeter
        
        if (unit === 'meter') {
            unitScale = 1000.0;
        } else if (unit === 'centimeter') {
            unitScale = 10.0;
        } else if (unit === 'inch') {
            unitScale = 25.4;
        } else if (unit === 'foot') {
            unitScale = 304.8;
        } else if (unit === 'micron') {
            unitScale = 0.001;
        }
        
        console.log(`   Unit: ${unit} (scale: ${unitScale})`);
        
        const resources = model.resources[0];
        const build = model.build?.[0];
        
        let allVertices = [];
        let allTriangles = [];
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let totalTriangleCount = 0;
        
        // Parse all objects in the model
        if (resources?.object) {
            for (const obj of resources.object) {
                // Check if this is a component-based object (Bambu-style)
                if (obj.components && obj.components[0]?.component) {
                    console.log(`   Processing component-based object (ID: ${obj.$.id})`);
                    
                    for (const comp of obj.components[0].component) {
                        const componentPath = comp.$?.['p:path'] || comp.$.path;
                        
                        if (componentPath && componentFiles[componentPath]) {
                            console.log(`   Loading component: ${componentPath}`);
                            const componentData = componentFiles[componentPath];
                            
                            // Parse component directly without recursion
                            const compModel = componentData.model;
                            if (compModel && compModel.resources && compModel.resources[0]?.object) {
                                for (const compObj of compModel.resources[0].object) {
                                    const mesh = compObj.mesh?.[0];
                                    if (!mesh) continue;
                                    
                                    let objVertices = [];
                                    
                                    // Parse vertices
                                    if (mesh.vertices?.[0]?.vertex) {
                                        for (const v of mesh.vertices[0].vertex) {
                                            const x = parseFloat(v.$.x) * unitScale;
                                            const y = parseFloat(v.$.y) * unitScale;
                                            const z = parseFloat(v.$.z) * unitScale;
                                            
                                            if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
                                            
                                            objVertices.push([x, y, z]);
                                            allVertices.push([x, y, z]);
                                            
                                            minX = Math.min(minX, x);
                                            minY = Math.min(minY, y);
                                            minZ = Math.min(minZ, z);
                                            maxX = Math.max(maxX, x);
                                            maxY = Math.max(maxY, y);
                                            maxZ = Math.max(maxZ, z);
                                        }
                                    }
                                    
                                    // Parse triangles
                                    if (mesh.triangles?.[0]?.triangle) {
                                        for (const tri of mesh.triangles[0].triangle) {
                                            const v1 = parseInt(tri.$.v1);
                                            const v2 = parseInt(tri.$.v2);
                                            const v3 = parseInt(tri.$.v3);
                                            
                                            if (v1 < objVertices.length && v2 < objVertices.length && v3 < objVertices.length) {
                                                allTriangles.push([
                                                    objVertices[v1],
                                                    objVertices[v2], 
                                                    objVertices[v3]
                                                ]);
                                                totalTriangleCount++;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // Standard mesh object
                    const mesh = obj.mesh?.[0];
                    if (!mesh) continue;
                    
                    let objVertices = [];
                    
                    // Parse vertices
                    if (mesh.vertices?.[0]?.vertex) {
                        for (const v of mesh.vertices[0].vertex) {
                            const x = parseFloat(v.$.x) * unitScale;
                            const y = parseFloat(v.$.y) * unitScale;
                            const z = parseFloat(v.$.z) * unitScale;
                            
                            if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
                            
                            objVertices.push([x, y, z]);
                            allVertices.push([x, y, z]);
                            
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            minZ = Math.min(minZ, z);
                            maxX = Math.max(maxX, x);
                            maxY = Math.max(maxY, y);
                            maxZ = Math.max(maxZ, z);
                        }
                    }
                    
                    // Parse triangles
                    if (mesh.triangles?.[0]?.triangle) {
                        for (const tri of mesh.triangles[0].triangle) {
                            const v1 = parseInt(tri.$.v1);
                            const v2 = parseInt(tri.$.v2);
                            const v3 = parseInt(tri.$.v3);
                            
                            if (v1 < objVertices.length && v2 < objVertices.length && v3 < objVertices.length) {
                                allTriangles.push([
                                    objVertices[v1],
                                    objVertices[v2], 
                                    objVertices[v3]
                                ]);
                                totalTriangleCount++;
                            }
                        }
                    }
                }
            }
        }
        
        if (allVertices.length === 0 || totalTriangleCount === 0) {
            throw new Error('No valid geometry found in 3MF model');
        }
        
        // Calculate volume using the divergence theorem (signed volume method)
        let volume = 0;
        for (const triangle of allTriangles) {
            const [v1, v2, v3] = triangle;
            
            // Signed volume of tetrahedron formed by triangle and origin
            const signedVolume = 
                v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) +
                v1[1] * (v2[2] * v3[0] - v2[0] * v3[2]) +
                v1[2] * (v2[0] * v3[1] - v2[1] * v3[0]);
            
            volume += signedVolume / 6.0;
        }
        
        volume = Math.abs(volume);
        
        // Calculate surface area
        let surfaceArea = 0;
        for (const triangle of allTriangles) {
            const [v1, v2, v3] = triangle;
            
            // Calculate triangle area using cross product
            const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
            const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
            
            const cross = [
                edge1[1] * edge2[2] - edge1[2] * edge2[1],
                edge1[2] * edge2[0] - edge1[0] * edge2[2],
                edge1[0] * edge2[1] - edge1[1] * edge2[0]
            ];
            
            const triangleArea = 0.5 * Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2);
            surfaceArea += triangleArea;
        }
        
        const dimensions = {
            x: maxX - minX,
            y: maxY - minY,
            z: maxZ - minZ
        };
        
        console.log(`📐 Parsed geometry: ${allVertices.length} vertices, ${totalTriangleCount} triangles`);
        
        return {
            triangleCount: totalTriangleCount,
            vertexCount: allVertices.length,
            dimensions,
            boundingBox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
            volume: volume, // mm³
            surfaceArea: surfaceArea, // mm²
            allVertices: allVertices, // Return for component processing
            allTriangles: allTriangles // Return for component processing
        };
    }

    extractBambuMetadata(metadata) {
        // Extract Bambu-specific settings from metadata
        const bambuData = {
            filamentType: 'PLA',
            infill: 15,
            layerHeight: 0.2,
            printSpeed: 150,
            temperature: 220,
            bedTemperature: 60
        };
        
        // Look for Bambu-specific metadata paths
        try {
            if (metadata.bambu || metadata.BambuStudio) {
                const bambuMeta = metadata.bambu || metadata.BambuStudio;
                if (bambuMeta.settings) {
                    const settings = bambuMeta.settings;
                    bambuData.filamentType = settings.filament_type || bambuData.filamentType;
                    bambuData.infill = parseInt(settings.fill_density) || bambuData.infill;
                    bambuData.layerHeight = parseFloat(settings.layer_height) || bambuData.layerHeight;
                    bambuData.printSpeed = parseInt(settings.print_speed) || bambuData.printSpeed;
                    bambuData.temperature = parseInt(settings.temperature) || bambuData.temperature;
                    bambuData.bedTemperature = parseInt(settings.bed_temperature) || bambuData.bedTemperature;
                }
            }
        } catch (error) {
            console.warn('Could not extract Bambu metadata:', error.message);
        }
        
        return bambuData;
    }

    calculateSupportFromGeometry(modelData) {
        // Calculate support material percentage based on geometry analysis
        if (!modelData.boundingBox || !modelData.volume) {
            return 0.15; // Default 15% support
        }
        
        const dimensions = modelData.dimensions;
        const volume = modelData.volume;
        
        // Calculate center of mass vs geometric center offset
        const geometricCenter = [
            (modelData.boundingBox.min[0] + modelData.boundingBox.max[0]) / 2,
            (modelData.boundingBox.min[1] + modelData.boundingBox.max[1]) / 2,
            (modelData.boundingBox.min[2] + modelData.boundingBox.max[2]) / 2
        ];
        
        // Simple heuristics for support calculation
        const maxDimension = Math.max(dimensions.x, dimensions.y, dimensions.z);
        const heightRatio = dimensions.z / Math.max(dimensions.x, dimensions.y);
        
        let supportPercentage = 0.05; // Base 5%
        
        // Tall objects likely need more support
        if (heightRatio > 2) {
            supportPercentage += 0.10; // Add 10% for tall objects
        } else if (heightRatio > 1.5) {
            supportPercentage += 0.05; // Add 5% for moderately tall objects
        }
        
        // Complex geometry (high triangle count relative to volume)
        if (modelData.triangleCount && volume > 0) {
            const triangleDensity = modelData.triangleCount / (volume / 1000); // triangles per cm³
            if (triangleDensity > 1000) {
                supportPercentage += 0.05; // Add 5% for complex geometry
            }
        }
        
        // Cap support percentage at reasonable levels
        return Math.min(supportPercentage, 0.30); // Max 30% support
    }
}

module.exports = BambuSlicerCLI;