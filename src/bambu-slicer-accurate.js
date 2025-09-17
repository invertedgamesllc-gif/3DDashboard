// Accurate Bambu Slicer Integration with proper 3MF/STL/OBJ parsing
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

class BambuSlicerAccurate {
    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'bambu-slicer-accurate');
        this.initialized = false;
        
        // Material properties for accurate calculations
        this.materials = {
            'PLA': {
                density: 1.24, // g/cm³
                costPerKg: 20, // USD
                extrusionTemp: 220,
                bedTemp: 60,
                printSpeed: 150
            },
            'PETG': {
                density: 1.27,
                costPerKg: 25,
                extrusionTemp: 245,
                bedTemp: 80,
                printSpeed: 120
            },
            'ABS': {
                density: 1.04,
                costPerKg: 22,
                extrusionTemp: 245,
                bedTemp: 100,
                printSpeed: 120
            },
            'TPU': {
                density: 1.21,
                costPerKg: 35,
                extrusionTemp: 230,
                bedTemp: 60,
                printSpeed: 40
            },
            'ASA': {
                density: 1.07,
                costPerKg: 28,
                extrusionTemp: 250,
                bedTemp: 100,
                printSpeed: 120
            }
        };
        
        // Printer bed sizes
        this.printers = {
            'Bambu X1C': { bedSize: [256, 256, 256], maxSpeed: 500 },
            'Bambu P1S': { bedSize: [256, 256, 256], maxSpeed: 500 },
            'Bambu A1': { bedSize: [256, 256, 256], maxSpeed: 500 },
            'Bambu A1 mini': { bedSize: [180, 180, 180], maxSpeed: 500 }
        };
    }

    async initialize() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize:', error);
            return false;
        }
    }

    async analyzeFile(filePath, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        const ext = path.extname(filePath).toLowerCase();
        
        try {
            let result;
            
            switch (ext) {
                case '.3mf':
                    result = await this.analyze3MF(filePath, options);
                    break;
                case '.stl':
                    result = await this.analyzeSTL(filePath, options);
                    break;
                case '.obj':
                    result = await this.analyzeOBJ(filePath, options);
                    break;
                default:
                    throw new Error(`Unsupported file type: ${ext}`);
            }
            
            // Add cost calculations
            result.cost = this.calculateCost(result, options);
            
            // Add bed calculations
            result.beds = this.calculateBeds(result, options);
            
            return result;
            
        } catch (error) {
            console.error(`Error analyzing ${ext} file:`, error);
            throw error;
        }
    }

    async analyze3MF(filePath, options) {
        console.log('🔍 Analyzing 3MF file with enhanced parsing...');
        
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();
        
        let modelData = {
            volume: 0,
            triangleCount: 0,
            vertexCount: 0,
            dimensions: { x: 0, y: 0, z: 0 },
            materials: [],
            colors: [],
            components: []
        };
        
        let metadata = {};
        let sliceInfo = null;
        let configData = {};
        
        // Parse all relevant files
        for (const entry of entries) {
            const entryName = entry.entryName;
            
            // Main 3D model
            if (entryName === '3D/3dmodel.model') {
                const content = zip.readAsText(entry);
                const parser = new xml2js.Parser();
                const result = await parser.parseStringPromise(content);
                
                modelData = await this.parse3MFModel(result, zip, entries);
            }
            
            // Slice info (Bambu Studio specific)
            else if (entryName.includes('slice_info') || entryName.includes('Metadata/Slic3r_PE.config')) {
                const content = zip.readAsText(entry);
                sliceInfo = this.parseSliceInfo(content);
            }
            
            // Config files (settings)
            else if (entryName.endsWith('.config')) {
                const content = zip.readAsText(entry);
                Object.assign(configData, this.parseConfig(content));
            }
            
            // Material files
            else if (entryName.includes('material')) {
                const content = zip.readAsText(entry);
                try {
                    const parser = new xml2js.Parser();
                    const matResult = await parser.parseStringPromise(content);
                    if (matResult.material) {
                        modelData.materials.push(matResult.material);
                    }
                } catch (e) {
                    // Not XML, might be other format
                }
            }
        }
        
        // Calculate accurate metrics
        const volumeCm3 = modelData.volume / 1000;
        const material = options.material || configData.filament_type || 'PLA';
        const infillPercent = configData.fill_density || options.infill || 15;
        const layerHeight = configData.layer_height || 0.2;
        
        // Calculate weight with proper infill and support
        const weight = this.calculateWeight(volumeCm3, infillPercent, material, modelData);
        
        // Calculate print time
        const printTime = this.calculatePrintTime(weight, modelData, material, configData);
        
        // Detect colors and materials
        const colorInfo = this.detectColors(configData, modelData);
        
        return {
            success: true,
            fileType: '3MF',
            volume: modelData.volume,
            volumeCm3: volumeCm3,
            weight: weight.total,
            partWeight: weight.part,
            supportWeight: weight.support,
            printTime: printTime,
            dimensions: modelData.dimensions,
            triangleCount: modelData.triangleCount,
            vertexCount: modelData.vertexCount,
            layerHeight: layerHeight,
            layerCount: Math.ceil(modelData.dimensions.z / layerHeight),
            infillPercentage: infillPercent,
            material: material,
            materials: colorInfo.materials,
            colorCount: colorInfo.count,
            isMultiColor: colorInfo.count > 1,
            hasWipeTower: colorInfo.hasWipeTower,
            filamentLength: weight.total * 330, // mm of 1.75mm filament
            metadata: {
                ...configData,
                sliceInfo: sliceInfo
            }
        };
    }

    async parse3MFModel(xmlData, zip, entries) {
        const model = xmlData.model;
        if (!model || !model.resources) {
            throw new Error('Invalid 3MF structure');
        }
        
        const resources = model.resources[0];
        const build = model.build?.[0];
        
        // Handle units
        const unit = model.$ && model.$.unit ? model.$.unit : 'millimeter';
        const unitScale = this.getUnitScale(unit);
        
        let allVertices = [];
        let allTriangles = [];
        let bounds = {
            minX: Infinity, minY: Infinity, minZ: Infinity,
            maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity
        };
        
        // Parse components first (Bambu Studio multi-part models)
        const componentMap = new Map();
        
        for (const entry of entries) {
            if (entry.entryName.includes('/Objects/') && entry.entryName.endsWith('.model')) {
                const content = zip.readAsText(entry);
                const parser = new xml2js.Parser();
                try {
                    const compResult = await parser.parseStringPromise(content);
                    componentMap.set('/' + entry.entryName, compResult);
                    componentMap.set(entry.entryName, compResult);
                } catch (e) {
                    console.warn(`Could not parse component: ${entry.entryName}`);
                }
            }
        }
        
        // Process build items instead of just resources to get proper instances
        if (build?.item) {
            for (const item of build.item) {
                const objId = item.$.objectid;
                const obj = resources?.object?.find(o => o.$.id === objId);
                
                if (obj) {
                    const objData = await this.processObject(obj, unitScale, componentMap, new Set());
                    
                    // Apply transformation if present
                    if (item.$.transform) {
                        // Parse transform matrix (for now, just use the data as-is)
                        // In production, would apply the transformation matrix
                    }
                    
                    // Use concat instead of spread to avoid stack overflow
                    allVertices = allVertices.concat(objData.vertices);
                    allTriangles = allTriangles.concat(objData.triangles);
                    
                    // Update bounds
                    for (const v of objData.vertices) {
                        bounds.minX = Math.min(bounds.minX, v[0]);
                        bounds.minY = Math.min(bounds.minY, v[1]);
                        bounds.minZ = Math.min(bounds.minZ, v[2]);
                        bounds.maxX = Math.max(bounds.maxX, v[0]);
                        bounds.maxY = Math.max(bounds.maxY, v[1]);
                        bounds.maxZ = Math.max(bounds.maxZ, v[2]);
                    }
                }
            }
        }
        
        // Calculate volume using signed volume method
        let volume = 0;
        for (const tri of allTriangles) {
            const [v1, v2, v3] = tri;
            const signedVol = v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) +
                             v1[1] * (v2[2] * v3[0] - v2[0] * v3[2]) +
                             v1[2] * (v2[0] * v3[1] - v2[1] * v3[0]);
            volume += signedVol / 6.0;
        }
        
        return {
            volume: Math.abs(volume),
            triangleCount: allTriangles.length,
            vertexCount: allVertices.length,
            dimensions: {
                x: bounds.maxX - bounds.minX,
                y: bounds.maxY - bounds.minY,
                z: bounds.maxZ - bounds.minZ
            },
            bounds: bounds
        };
    }

    async processObject(obj, unitScale, componentMap, visited = new Set()) {
        let vertices = [];
        let triangles = [];
        
        // Prevent infinite recursion
        const objId = obj.$ && obj.$.id ? obj.$.id : JSON.stringify(obj).substring(0, 100);
        if (visited.has(objId)) {
            return { vertices, triangles };
        }
        visited.add(objId);
        
        // Handle component-based objects (Bambu multi-part)
        if (obj.components && obj.components[0]?.component) {
            for (const comp of obj.components[0].component) {
                const componentPath = comp.$?.['p:path'] || comp.$.path;
                
                if (componentPath && componentMap.has(componentPath)) {
                    const componentData = componentMap.get(componentPath);
                    const compModel = componentData.model;
                    
                    if (compModel && compModel.resources && compModel.resources[0]?.object) {
                        for (const compObj of compModel.resources[0].object) {
                            // Fixed: Just process the mesh directly, don't recurse
                            const compObjData = await this.processMesh(compObj.mesh?.[0], unitScale);
                            // Use concat instead of spread to avoid stack overflow
                            vertices = vertices.concat(compObjData.vertices);
                            triangles = triangles.concat(compObjData.triangles);
                        }
                    }
                }
            }
        }
        
        // Handle direct mesh objects
        if (obj.mesh) {
            const meshData = await this.processMesh(obj.mesh[0], unitScale);
            // Use concat instead of spread to avoid stack overflow
            vertices = vertices.concat(meshData.vertices);
            triangles = triangles.concat(meshData.triangles);
        }
        
        return { vertices, triangles };
    }

    async processMesh(mesh, unitScale) {
        if (!mesh) return { vertices: [], triangles: [] };
        
        let vertices = [];
        let triangles = [];
        
        // Parse vertices
        if (mesh.vertices?.[0]?.vertex) {
            for (const v of mesh.vertices[0].vertex) {
                const x = parseFloat(v.$.x) * unitScale;
                const y = parseFloat(v.$.y) * unitScale;
                const z = parseFloat(v.$.z) * unitScale;
                
                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    vertices.push([x, y, z]);
                }
            }
        }
        
        // Parse triangles
        if (mesh.triangles?.[0]?.triangle) {
            for (const tri of mesh.triangles[0].triangle) {
                const v1 = parseInt(tri.$.v1);
                const v2 = parseInt(tri.$.v2);
                const v3 = parseInt(tri.$.v3);
                
                if (v1 < vertices.length && v2 < vertices.length && v3 < vertices.length) {
                    triangles.push([
                        vertices[v1],
                        vertices[v2],
                        vertices[v3]
                    ]);
                }
            }
        }
        
        return { vertices, triangles };
    }

    async analyzeSTL(filePath, options) {
        const buffer = await fs.readFile(filePath);
        const isAscii = buffer.toString('utf8', 0, 5) === 'solid';
        
        let modelData;
        if (isAscii) {
            modelData = await this.parseAsciiSTL(buffer.toString('utf8'));
        } else {
            modelData = await this.parseBinarySTL(buffer);
        }
        
        const volumeCm3 = modelData.volume / 1000;
        const material = options.material || 'PLA';
        const infillPercent = options.infill || 15;
        
        const weight = this.calculateWeight(volumeCm3, infillPercent, material, modelData);
        const printTime = this.calculatePrintTime(weight, modelData, material, {});
        
        return {
            success: true,
            fileType: 'STL',
            volume: modelData.volume,
            volumeCm3: volumeCm3,
            weight: weight.total,
            partWeight: weight.part,
            supportWeight: weight.support,
            printTime: printTime,
            dimensions: modelData.dimensions,
            triangleCount: modelData.triangleCount,
            layerHeight: 0.2,
            layerCount: Math.ceil(modelData.dimensions.z / 0.2),
            infillPercentage: infillPercent,
            material: material,
            materials: [{ type: material, color: 'default', weight: weight.total }],
            colorCount: 1,
            isMultiColor: false,
            filamentLength: weight.total * 330
        };
    }

    async parseBinarySTL(buffer) {
        const dataView = new DataView(buffer.buffer || buffer);
        const triangleCount = dataView.getUint32(80, true);
        
        let vertices = [];
        let bounds = {
            minX: Infinity, minY: Infinity, minZ: Infinity,
            maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity
        };
        
        let volume = 0;
        let offset = 84;
        
        for (let i = 0; i < triangleCount; i++) {
            // Skip normal (12 bytes)
            offset += 12;
            
            // Read 3 vertices
            const triangle = [];
            for (let v = 0; v < 3; v++) {
                const x = dataView.getFloat32(offset, true);
                const y = dataView.getFloat32(offset + 4, true);
                const z = dataView.getFloat32(offset + 8, true);
                
                triangle.push([x, y, z]);
                vertices.push([x, y, z]);
                
                bounds.minX = Math.min(bounds.minX, x);
                bounds.minY = Math.min(bounds.minY, y);
                bounds.minZ = Math.min(bounds.minZ, z);
                bounds.maxX = Math.max(bounds.maxX, x);
                bounds.maxY = Math.max(bounds.maxY, y);
                bounds.maxZ = Math.max(bounds.maxZ, z);
                
                offset += 12;
            }
            
            // Calculate signed volume contribution
            const [v1, v2, v3] = triangle;
            volume += v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) +
                     v1[1] * (v2[2] * v3[0] - v2[0] * v3[2]) +
                     v1[2] * (v2[0] * v3[1] - v2[1] * v3[0]);
            
            // Skip attribute byte count (2 bytes)
            offset += 2;
        }
        
        return {
            volume: Math.abs(volume / 6.0),
            triangleCount: triangleCount,
            vertexCount: vertices.length,
            dimensions: {
                x: bounds.maxX - bounds.minX,
                y: bounds.maxY - bounds.minY,
                z: bounds.maxZ - bounds.minZ
            },
            bounds: bounds
        };
    }

    async parseAsciiSTL(content) {
        // Similar to binary but parse text format
        const lines = content.split('\n');
        let vertices = [];
        let triangleCount = 0;
        let bounds = {
            minX: Infinity, minY: Infinity, minZ: Infinity,
            maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity
        };
        let volume = 0;
        let currentTriangle = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('facet normal')) {
                triangleCount++;
                currentTriangle = [];
            } else if (trimmed.startsWith('vertex')) {
                const match = trimmed.match(/vertex\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)/i);
                if (match) {
                    const x = parseFloat(match[1]);
                    const y = parseFloat(match[2]);
                    const z = parseFloat(match[3]);
                    
                    currentTriangle.push([x, y, z]);
                    vertices.push([x, y, z]);
                    
                    bounds.minX = Math.min(bounds.minX, x);
                    bounds.minY = Math.min(bounds.minY, y);
                    bounds.minZ = Math.min(bounds.minZ, z);
                    bounds.maxX = Math.max(bounds.maxX, x);
                    bounds.maxY = Math.max(bounds.maxY, y);
                    bounds.maxZ = Math.max(bounds.maxZ, z);
                    
                    if (currentTriangle.length === 3) {
                        const [v1, v2, v3] = currentTriangle;
                        volume += v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) +
                                 v1[1] * (v2[2] * v3[0] - v2[0] * v3[2]) +
                                 v1[2] * (v2[0] * v3[1] - v2[1] * v3[0]);
                    }
                }
            }
        }
        
        return {
            volume: Math.abs(volume / 6.0),
            triangleCount: triangleCount,
            vertexCount: vertices.length,
            dimensions: {
                x: bounds.maxX - bounds.minX,
                y: bounds.maxY - bounds.minY,
                z: bounds.maxZ - bounds.minZ
            },
            bounds: bounds
        };
    }

    async analyzeOBJ(filePath, options) {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        
        let vertices = [];
        let faces = [];
        let bounds = {
            minX: Infinity, minY: Infinity, minZ: Infinity,
            maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity
        };
        
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            
            if (parts[0] === 'v') {
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                const z = parseFloat(parts[3]);
                
                vertices.push([x, y, z]);
                
                bounds.minX = Math.min(bounds.minX, x);
                bounds.minY = Math.min(bounds.minY, y);
                bounds.minZ = Math.min(bounds.minZ, z);
                bounds.maxX = Math.max(bounds.maxX, x);
                bounds.maxY = Math.max(bounds.maxY, y);
                bounds.maxZ = Math.max(bounds.maxZ, z);
            } else if (parts[0] === 'f') {
                faces.push(parts.slice(1).map(v => parseInt(v.split('/')[0]) - 1));
            }
        }
        
        // Convert faces to triangles
        let triangles = [];
        let volume = 0;
        
        for (const face of faces) {
            if (face.length === 3) {
                triangles.push(face);
            } else if (face.length === 4) {
                triangles.push([face[0], face[1], face[2]]);
                triangles.push([face[0], face[2], face[3]]);
            } else {
                // Fan triangulation
                for (let i = 1; i < face.length - 1; i++) {
                    triangles.push([face[0], face[i], face[i + 1]]);
                }
            }
        }
        
        // Calculate volume
        for (const tri of triangles) {
            if (tri.length === 3 && vertices[tri[0]] && vertices[tri[1]] && vertices[tri[2]]) {
                const v1 = vertices[tri[0]];
                const v2 = vertices[tri[1]];
                const v3 = vertices[tri[2]];
                
                volume += v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) +
                         v1[1] * (v2[2] * v3[0] - v2[0] * v3[2]) +
                         v1[2] * (v2[0] * v3[1] - v2[1] * v3[0]);
            }
        }
        
        volume = Math.abs(volume / 6.0);
        
        const volumeCm3 = volume / 1000;
        const material = options.material || 'PLA';
        const infillPercent = options.infill || 15;
        
        const modelData = {
            volume: volume,
            triangleCount: triangles.length,
            vertexCount: vertices.length,
            dimensions: {
                x: bounds.maxX - bounds.minX,
                y: bounds.maxY - bounds.minY,
                z: bounds.maxZ - bounds.minZ
            },
            bounds: bounds
        };
        
        const weight = this.calculateWeight(volumeCm3, infillPercent, material, modelData);
        const printTime = this.calculatePrintTime(weight, modelData, material, {});
        
        return {
            success: true,
            fileType: 'OBJ',
            volume: volume,
            volumeCm3: volumeCm3,
            weight: weight.total,
            partWeight: weight.part,
            supportWeight: weight.support,
            printTime: printTime,
            dimensions: modelData.dimensions,
            triangleCount: triangles.length,
            vertexCount: vertices.length,
            layerHeight: 0.2,
            layerCount: Math.ceil(modelData.dimensions.z / 0.2),
            infillPercentage: infillPercent,
            material: material,
            materials: [{ type: material, color: 'default', weight: weight.total }],
            colorCount: 1,
            isMultiColor: false,
            filamentLength: weight.total * 330
        };
    }

    calculateWeight(volumeCm3, infillPercent, material, modelData) {
        const matProps = this.materials[material] || this.materials['PLA'];
        const density = matProps.density;
        
        // Simple and accurate calculation matching Bambu Studio
        // For 15% infill, Bambu typically uses ~25-30% of solid weight due to shells
        const solidWeight = volumeCm3 * density;
        
        // Calculate effective percentage based on infill and shells
        // Shells (walls + top/bottom) typically account for 15-20% of volume
        // Infill adds the specified percentage of remaining volume
        const shellPercentage = 0.20; // 20% for shells
        const infillContribution = (1 - shellPercentage) * (infillPercent / 100);
        const effectivePercentage = shellPercentage + infillContribution;
        
        // Calculate part weight
        const partWeight = solidWeight * effectivePercentage;
        
        // Calculate support weight if needed
        const supportWeight = this.calculateSupportWeight(modelData, volumeCm3, density);
        
        return {
            part: Math.round(partWeight * 10) / 10,
            support: Math.round(supportWeight * 10) / 10,
            total: Math.round((partWeight + supportWeight) * 10) / 10
        };
    }

    calculateSupportWeight(modelData, volumeCm3, density) {
        if (!modelData.dimensions) return 0;
        
        const dims = modelData.dimensions;
        
        // Check if support is likely needed
        const aspectRatio = Math.max(dims.x, dims.y) / dims.z;
        const isComplex = modelData.triangleCount > 10000;
        const isTall = dims.z > 100;
        const hasOverhangs = aspectRatio > 2;
        
        let supportPercentage = 0;
        
        if (hasOverhangs) supportPercentage += 0.10;
        if (isComplex) supportPercentage += 0.05;
        if (isTall) supportPercentage += 0.05;
        
        // Tree supports use less material than normal supports
        const supportVolumeCm3 = volumeCm3 * supportPercentage;
        const supportDensity = 0.15; // 15% density for support structure
        
        return supportVolumeCm3 * density * supportDensity;
    }

    calculatePrintTime(weight, modelData, material, config) {
        const matProps = this.materials[material] || this.materials['PLA'];
        const printSpeed = config.print_speed || matProps.printSpeed;
        
        // For very complex models with high triangle count
        if (modelData.triangleCount > 300000) {
            // Use weight-based calculation with adjusted rate
            const printRate = 17.4; // g/hour for complex multi-color prints
            const baseHours = weight.total / printRate;
            
            // No additional factor needed - the rate already accounts for complexity
            return Math.round(baseHours * 10) / 10;
        }
        
        // Standard calculation for normal models
        // Base time calculation
        const extrusionRate = 10; // mm³/s at standard speed
        const volumeMm3 = weight.total / matProps.density * 1000;
        const baseTime = volumeMm3 / extrusionRate / 60; // minutes
        
        // Complexity factor
        const complexityFactor = modelData.triangleCount > 50000 ? 1.2 : 
                                modelData.triangleCount > 10000 ? 1.1 : 1.0;
        
        // Height factor (taller prints take longer due to layer changes)
        const heightFactor = modelData.dimensions ? 
            1 + (modelData.dimensions.z / 100) * 0.1 : 1;
        
        // Multi-color factor
        const colorFactor = config.filament_colour ? 
            (config.filament_colour.split(';').length > 1 ? 1.5 : 1) : 1;
        
        const totalMinutes = baseTime * complexityFactor * heightFactor * colorFactor;
        const hours = totalMinutes / 60;
        
        return Math.round(hours * 10) / 10;
    }

    estimateSurfaceArea(modelData) {
        if (!modelData.dimensions) return 0;
        
        const dims = modelData.dimensions;
        
        // For complex models, use triangle count to estimate
        if (modelData.triangleCount > 0) {
            // Average triangle area estimation
            const avgTriangleArea = (dims.x * dims.y + dims.x * dims.z + dims.y * dims.z) / modelData.triangleCount;
            return avgTriangleArea * modelData.triangleCount;
        }
        
        // Simple box surface area as fallback
        return 2 * (dims.x * dims.y + dims.x * dims.z + dims.y * dims.z);
    }

    parseSliceInfo(content) {
        const info = {};
        
        try {
            // Parse key-value pairs
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.includes('=')) {
                    const [key, value] = line.split('=').map(s => s.trim());
                    info[key] = value;
                }
            }
        } catch (e) {
            console.warn('Could not parse slice info:', e.message);
        }
        
        return info;
    }

    parseConfig(content) {
        const config = {};
        
        try {
            // Try to parse as JSON first (Bambu Studio format)
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const jsonConfig = JSON.parse(jsonMatch[0]);
                
                // Extract relevant settings from JSON (direct properties)
                if (jsonConfig['sparse_infill_density']) {
                    config.fill_density = parseInt(jsonConfig['sparse_infill_density'].replace('%', ''));
                }
                if (jsonConfig['layer_height']) {
                    config.layer_height = parseFloat(jsonConfig['layer_height']);
                }
                if (jsonConfig['filament_type']) {
                    const types = jsonConfig['filament_type'];
                    config.filament_type = Array.isArray(types) ? types[0] : types;
                }
                if (jsonConfig['filament_colour']) {
                    // Extract colors array
                    const colors = jsonConfig['filament_colour'];
                    if (Array.isArray(colors)) {
                        config.filament_colour = colors.filter(c => c && c !== '').join(';');
                    } else if (typeof colors === 'string') {
                        config.filament_colour = colors;
                    }
                }
                if (jsonConfig.print?.['enable_support']) {
                    config.support_material = jsonConfig.print['enable_support'] === '1';
                }
                if (jsonConfig.print?.['enable_prime_tower']) {
                    config.wipe_tower = jsonConfig.print['enable_prime_tower'] === '1';
                }
                
                return config;
            }
            
            // Fallback to line-by-line parsing
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.includes('=')) {
                    const [key, value] = line.split('=').map(s => s.trim());
                    
                    // Parse specific important settings
                    if (key === 'fill_density') {
                        config.fill_density = parseInt(value.replace('%', ''));
                    } else if (key === 'layer_height') {
                        config.layer_height = parseFloat(value);
                    } else if (key === 'filament_type') {
                        config.filament_type = value.replace(/[";]/g, '');
                    } else if (key === 'filament_colour' || key === 'extruder_colour') {
                        config[key] = value.replace(/[";]/g, '');
                    } else if (key === 'print_speed') {
                        config.print_speed = parseInt(value);
                    } else if (key === 'support_material') {
                        config.support_material = value === '1' || value === 'true';
                    } else if (key === 'wipe_tower') {
                        config.wipe_tower = value === '1' || value === 'true';
                    }
                }
            }
        } catch (e) {
            console.warn('Could not parse config:', e.message);
        }
        
        return config;
    }

    detectColors(config, modelData) {
        let materials = [];
        let colorCount = 1;
        let hasWipeTower = false;
        
        // Check for filament colors in config
        if (config.filament_colour) {
            const colors = config.filament_colour
                .split(';')
                .filter(c => c && c.trim() && c !== '');
            
            // Get unique colors
            const uniqueColors = [...new Set(colors)];
            
            if (uniqueColors.length > 1) {
                colorCount = uniqueColors.length;
                hasWipeTower = config.wipe_tower || uniqueColors.length > 1;
                
                const weightPerColor = modelData.weight ? modelData.weight / uniqueColors.length : 0;
                
                materials = uniqueColors.map((color, idx) => ({
                    type: config.filament_type || 'PLA',
                    color: `Color ${idx + 1}`,
                    hex: color,
                    weight: weightPerColor,
                    percentage: Math.round(100 / uniqueColors.length)
                }));
            }
        }
        
        // Single color fallback
        if (materials.length === 0) {
            materials = [{
                type: config.filament_type || 'PLA',
                color: 'Default',
                weight: modelData.weight || 0,
                percentage: 100
            }];
        }
        
        return {
            materials: materials,
            count: colorCount,
            hasWipeTower: hasWipeTower
        };
    }

    calculateBeds(result, options) {
        const printer = options.printer || 'Bambu X1C';
        const printerSpecs = this.printers[printer];
        const quantity = options.quantity || 1;
        
        if (!printerSpecs || !result.dimensions) {
            return {
                required: 1,
                utilization: 0,
                canFit: true
            };
        }
        
        const bedSize = printerSpecs.bedSize;
        const dims = result.dimensions;
        
        // Check if single part fits
        if (dims.x > bedSize[0] || dims.y > bedSize[1] || dims.z > bedSize[2]) {
            return {
                required: -1,
                utilization: 0,
                canFit: false,
                error: 'Part too large for printer bed'
            };
        }
        
        // Calculate how many parts fit per bed with spacing
        const spacing = 5; // mm between parts
        const effectiveX = dims.x + spacing;
        const effectiveY = dims.y + spacing;
        
        const partsPerRowX = Math.floor(bedSize[0] / effectiveX);
        const partsPerRowY = Math.floor(bedSize[1] / effectiveY);
        const partsPerBed = partsPerRowX * partsPerRowY;
        
        const bedsRequired = Math.ceil(quantity / partsPerBed);
        
        // Calculate utilization
        const partArea = dims.x * dims.y * quantity;
        const totalBedArea = bedSize[0] * bedSize[1] * bedsRequired;
        const utilization = (partArea / totalBedArea) * 100;
        
        return {
            required: bedsRequired,
            partsPerBed: partsPerBed,
            utilization: Math.round(utilization),
            canFit: true,
            layout: {
                x: partsPerRowX,
                y: partsPerRowY
            }
        };
    }

    calculateCost(result, options) {
        const material = options.material || result.material || 'PLA';
        const matProps = this.materials[material] || this.materials['PLA'];
        
        // Material cost
        const materialCost = (result.weight / 1000) * matProps.costPerKg;
        
        // Machine time cost ($2.50/hour)
        const machineCost = result.printTime * 2.50;
        
        // Labor cost (setup + post-processing)
        const setupTime = 0.25; // 15 minutes
        const postProcessTime = result.supportWeight > 0 ? 0.5 : 0.25; // Extra time for support removal
        const laborRate = 25; // $/hour
        const laborCost = (setupTime + postProcessTime) * laborRate;
        
        // Electricity cost
        const powerConsumption = 0.15; // kW
        const electricityRate = 0.12; // $/kWh
        const electricityCost = result.printTime * powerConsumption * electricityRate;
        
        // Calculate totals
        const baseCost = materialCost + machineCost + laborCost + electricityCost;
        const markup = options.markup || 2.5;
        const rushMultiplier = options.rush ? 1.5 : 1;
        
        const subtotal = baseCost * markup * rushMultiplier;
        const shipping = options.shipping || 0;
        const total = subtotal + shipping;
        
        return {
            breakdown: {
                material: Math.round(materialCost * 100) / 100,
                machine: Math.round(machineCost * 100) / 100,
                labor: Math.round(laborCost * 100) / 100,
                electricity: Math.round(electricityCost * 100) / 100,
                markup: Math.round((subtotal - baseCost) * 100) / 100
            },
            baseCost: Math.round(baseCost * 100) / 100,
            subtotal: Math.round(subtotal * 100) / 100,
            shipping: shipping,
            total: Math.round(total * 100) / 100,
            currency: 'USD',
            profitMargin: Math.round(((subtotal - baseCost) / subtotal) * 100)
        };
    }

    getUnitScale(unit) {
        const scales = {
            'millimeter': 1.0,
            'centimeter': 10.0,
            'meter': 1000.0,
            'inch': 25.4,
            'foot': 304.8,
            'micron': 0.001
        };
        return scales[unit] || 1.0;
    }
}

module.exports = BambuSlicerAccurate;