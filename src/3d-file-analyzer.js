// 3D File Analyzer - Extracts metrics from STL, 3MF, and OBJ files
const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

class File3DAnalyzer {
    constructor() {
        // Material densities in g/cm³
        this.materialDensities = {
            'PLA': 1.24,
            'ABS': 1.04,
            'PETG': 1.27,
            'TPU': 1.21,
            'Nylon': 1.14,
            'ASA': 1.07,
            'PC': 1.20,
            'PVA': 1.23,
            'HIPS': 1.04,
            'PP': 0.90,
            'Resin': 1.15
        };

        // Printer specifications
        this.printerSpecs = {
            'Bambu X1C': { bedSize: [256, 256, 256], maxSpeed: 500 },
            'Bambu P1S': { bedSize: [256, 256, 256], maxSpeed: 500 },
            'Bambu A1': { bedSize: [256, 256, 256], maxSpeed: 500 },
            'Prusa MK4': { bedSize: [250, 210, 220], maxSpeed: 200 },
            'Ender 3': { bedSize: [220, 220, 250], maxSpeed: 150 }
        };

        // Print settings profiles
        this.printProfiles = {
            'draft': { layerHeight: 0.3, infill: 10, speed: 150, wallCount: 2 },
            'standard': { layerHeight: 0.2, infill: 20, speed: 100, wallCount: 3 },
            'quality': { layerHeight: 0.15, infill: 25, speed: 60, wallCount: 3 },
            'high_quality': { layerHeight: 0.1, infill: 30, speed: 40, wallCount: 4 },
            'strength': { layerHeight: 0.2, infill: 50, speed: 80, wallCount: 5 }
        };
    }

    async analyzeFile(filePath, options = {}) {
        // Validate file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            throw new Error(`File not found: ${filePath}`);
        }
        
        const ext = path.extname(filePath).toLowerCase();
        
        // Validate extension
        if (!ext) {
            throw new Error('File has no extension');
        }
        
        if (!['.stl', '.3mf', '.obj'].includes(ext)) {
            throw new Error(`Unsupported file type: ${ext}. Supported types: STL, 3MF, OBJ`);
        }
        
        const fileStats = await fs.stat(filePath);
        
        // Check file size
        if (fileStats.size === 0) {
            throw new Error('File is empty');
        }
        
        if (fileStats.size > 100 * 1024 * 1024) { // 100MB limit
            throw new Error('File too large (max 100MB)');
        }
        
        let analysis = {
            fileName: path.basename(filePath),
            fileSize: fileStats.size,
            fileType: ext.substring(1).toUpperCase(),
            timestamp: new Date().toISOString()
        };

        try {
            switch (ext) {
                case '.stl':
                    analysis = { ...analysis, ...await this.analyzeSTL(filePath, options) };
                    break;
                case '.3mf':
                    analysis = { ...analysis, ...await this.analyze3MF(filePath, options) };
                    break;
                case '.obj':
                    analysis = { ...analysis, ...await this.analyzeOBJ(filePath, options) };
                    break;
            }
            
            // Validate analysis results
            if (!analysis.volume || analysis.volume <= 0) {
                throw new Error('Invalid model: volume is zero or negative');
            }
            
            if (!analysis.dimensions) {
                throw new Error('Invalid model: could not determine dimensions');
            }

            // Calculate additional metrics
            analysis = this.calculatePrintMetrics(analysis, options);
            
            // Final validation
            if (!analysis.metrics) {
                throw new Error('Failed to calculate print metrics');
            }
            
        } catch (error) {
            console.error(`Error analyzing file: ${error.message}`);
            throw error; // Re-throw to be handled by server
        }

        return analysis;
    }

    async analyzeSTL(filePath, options) {
        const buffer = await fs.readFile(filePath);
        
        // Check if ASCII or Binary STL
        const isAscii = buffer.toString('utf8', 0, 5) === 'solid';
        
        if (isAscii) {
            return this.parseAsciiSTL(buffer.toString('utf8'));
        } else {
            return this.parseBinarySTL(buffer);
        }
    }

    parseBinarySTL(buffer) {
        // Binary STL format
        // 80 bytes header
        // 4 bytes - number of triangles
        // For each triangle:
        //   12 bytes - normal vector (3 floats)
        //   36 bytes - vertices (3 vertices × 3 floats × 4 bytes)
        //   2 bytes - attribute byte count

        const triangleCount = buffer.readUInt32LE(80);
        const vertices = [];
        const normals = [];
        
        let offset = 84;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < triangleCount; i++) {
            // Read normal
            const normal = [
                buffer.readFloatLE(offset),
                buffer.readFloatLE(offset + 4),
                buffer.readFloatLE(offset + 8)
            ];
            normals.push(normal);
            offset += 12;

            // Read vertices
            for (let j = 0; j < 3; j++) {
                const x = buffer.readFloatLE(offset);
                const y = buffer.readFloatLE(offset + 4);
                const z = buffer.readFloatLE(offset + 8);
                
                vertices.push([x, y, z]);
                
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                minZ = Math.min(minZ, z);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                maxZ = Math.max(maxZ, z);
                
                offset += 12;
            }
            
            offset += 2; // Skip attribute byte count
        }

        // Calculate volume using the divergence theorem
        const volume = this.calculateVolumeFromTriangles(vertices, triangleCount);
        
        // Calculate dimensions
        const dimensions = {
            x: maxX - minX,
            y: maxY - minY,
            z: maxZ - minZ
        };

        // Calculate surface area
        const surfaceArea = this.calculateSurfaceArea(vertices, triangleCount);

        return {
            triangleCount,
            vertexCount: vertices.length,
            dimensions,
            boundingBox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
            volume: Math.abs(volume), // mm³
            surfaceArea, // mm²
            centerOfMass: this.calculateCenterOfMass(vertices),
            complexity: this.calculateComplexity(triangleCount, surfaceArea, volume)
        };
    }

    parseAsciiSTL(content) {
        const lines = content.split('\n');
        const vertices = [];
        let triangleCount = 0;
        
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('facet normal')) {
                triangleCount++;
            } else if (line.startsWith('vertex')) {
                const coords = line.match(/vertex\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)/i);
                if (coords) {
                    const x = parseFloat(coords[1]);
                    const y = parseFloat(coords[2]);
                    const z = parseFloat(coords[3]);
                    
                    vertices.push([x, y, z]);
                    
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    minZ = Math.min(minZ, z);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                    maxZ = Math.max(maxZ, z);
                }
            }
        }

        const volume = this.calculateVolumeFromTriangles(vertices, triangleCount);
        const dimensions = {
            x: maxX - minX,
            y: maxY - minY,
            z: maxZ - minZ
        };
        const surfaceArea = this.calculateSurfaceArea(vertices, triangleCount);

        return {
            triangleCount,
            vertexCount: vertices.length,
            dimensions,
            boundingBox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
            volume: Math.abs(volume),
            surfaceArea,
            centerOfMass: this.calculateCenterOfMass(vertices),
            complexity: this.calculateComplexity(triangleCount, surfaceArea, volume)
        };
    }

    async analyze3MF(filePath, options) {
        // 3MF is a ZIP-based format containing XML files
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();
        
        let modelData = null;
        let metadata = {};
        
        for (const entry of entries) {
            if (entry.entryName.endsWith('3dmodel.model')) {
                const content = zip.readAsText(entry);
                const parser = new xml2js.Parser();
                const result = await parser.parseStringPromise(content);
                
                // Extract model data from XML
                modelData = this.parse3MFModel(result);
            } else if (entry.entryName.includes('metadata')) {
                const content = zip.readAsText(entry);
                // Parse metadata if available
                try {
                    metadata = JSON.parse(content);
                } catch (e) {
                    // Metadata might be XML or other format
                }
            }
        }
        
        if (!modelData) {
            throw new Error('No valid 3D model found in 3MF file');
        }
        
        return { ...modelData, metadata };
    }

    parse3MFModel(xmlData) {
        // Parse 3MF XML structure
        const model = xmlData.model;
        const resources = model.resources?.[0];
        const build = model.build?.[0];
        
        let vertices = [];
        let triangles = [];
        let dimensions = { x: 0, y: 0, z: 0 };
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        
        if (resources?.object) {
            for (const obj of resources.object) {
                const mesh = obj.mesh?.[0];
                if (mesh?.vertices?.[0]?.vertex) {
                    for (const v of mesh.vertices[0].vertex) {
                        const x = parseFloat(v.$.x);
                        const y = parseFloat(v.$.y);
                        const z = parseFloat(v.$.z);
                        
                        vertices.push([x, y, z]);
                        
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        minZ = Math.min(minZ, z);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                        maxZ = Math.max(maxZ, z);
                    }
                }
                
                if (mesh?.triangles?.[0]?.triangle) {
                    triangles = triangles.concat(mesh.triangles[0].triangle);
                }
            }
        }
        
        dimensions = {
            x: maxX - minX,
            y: maxY - minY,
            z: maxZ - minZ
        };
        
        const volume = this.calculateVolumeFromTriangles(vertices, triangles.length);
        const surfaceArea = this.calculateSurfaceArea(vertices, triangles.length);
        
        return {
            triangleCount: triangles.length,
            vertexCount: vertices.length,
            dimensions,
            boundingBox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
            volume: Math.abs(volume),
            surfaceArea,
            centerOfMass: this.calculateCenterOfMass(vertices),
            complexity: this.calculateComplexity(triangles.length, surfaceArea, volume)
        };
    }

    async analyzeOBJ(filePath, options) {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        
        const vertices = [];
        const faces = [];
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            
            if (parts[0] === 'v') {
                // Vertex
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                const z = parseFloat(parts[3]);
                
                vertices.push([x, y, z]);
                
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                minZ = Math.min(minZ, z);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                maxZ = Math.max(maxZ, z);
            } else if (parts[0] === 'f') {
                // Face
                faces.push(parts.slice(1).map(v => parseInt(v.split('/')[0]) - 1));
            }
        }
        
        const dimensions = {
            x: maxX - minX,
            y: maxY - minY,
            z: maxZ - minZ
        };
        
        // Convert faces to triangles if needed
        const triangles = this.facesToTriangles(faces);
        const volume = this.calculateVolumeFromFaces(vertices, triangles);
        const surfaceArea = this.calculateSurfaceAreaFromFaces(vertices, triangles);
        
        return {
            triangleCount: triangles.length,
            vertexCount: vertices.length,
            dimensions,
            boundingBox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
            volume: Math.abs(volume),
            surfaceArea,
            centerOfMass: this.calculateCenterOfMass(vertices),
            complexity: this.calculateComplexity(triangles.length, surfaceArea, volume)
        };
    }

    facesToTriangles(faces) {
        const triangles = [];
        
        for (const face of faces) {
            if (face.length === 3) {
                triangles.push(face);
            } else if (face.length === 4) {
                // Convert quad to two triangles
                triangles.push([face[0], face[1], face[2]]);
                triangles.push([face[0], face[2], face[3]]);
            } else {
                // Fan triangulation for n-gons
                for (let i = 1; i < face.length - 1; i++) {
                    triangles.push([face[0], face[i], face[i + 1]]);
                }
            }
        }
        
        return triangles;
    }

    calculateVolumeFromTriangles(vertices, triangleCount) {
        let volume = 0;
        
        for (let i = 0; i < triangleCount; i++) {
            const v1 = vertices[i * 3];
            const v2 = vertices[i * 3 + 1];
            const v3 = vertices[i * 3 + 2];
            
            if (!v1 || !v2 || !v3) continue;
            
            // Signed volume of tetrahedron formed by triangle and origin
            const v = v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) +
                     v1[1] * (v2[2] * v3[0] - v2[0] * v3[2]) +
                     v1[2] * (v2[0] * v3[1] - v2[1] * v3[0]);
            
            volume += v;
        }
        
        return Math.abs(volume / 6.0);
    }

    calculateVolumeFromFaces(vertices, faces) {
        let volume = 0;
        
        for (const face of faces) {
            if (face.length >= 3) {
                const v1 = vertices[face[0]];
                const v2 = vertices[face[1]];
                const v3 = vertices[face[2]];
                
                if (!v1 || !v2 || !v3) continue;
                
                const v = v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) +
                         v1[1] * (v2[2] * v3[0] - v2[0] * v3[2]) +
                         v1[2] * (v2[0] * v3[1] - v2[1] * v3[0]);
                
                volume += v;
            }
        }
        
        return Math.abs(volume / 6.0);
    }

    calculateSurfaceArea(vertices, triangleCount) {
        let area = 0;
        
        for (let i = 0; i < triangleCount; i++) {
            const v1 = vertices[i * 3];
            const v2 = vertices[i * 3 + 1];
            const v3 = vertices[i * 3 + 2];
            
            if (!v1 || !v2 || !v3) continue;
            
            // Calculate triangle area using cross product
            const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
            const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
            
            const cross = [
                edge1[1] * edge2[2] - edge1[2] * edge2[1],
                edge1[2] * edge2[0] - edge1[0] * edge2[2],
                edge1[0] * edge2[1] - edge1[1] * edge2[0]
            ];
            
            const triangleArea = 0.5 * Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2);
            area += triangleArea;
        }
        
        return area;
    }

    calculateSurfaceAreaFromFaces(vertices, faces) {
        let area = 0;
        
        for (const face of faces) {
            if (face.length >= 3) {
                const v1 = vertices[face[0]];
                const v2 = vertices[face[1]];
                const v3 = vertices[face[2]];
                
                if (!v1 || !v2 || !v3) continue;
                
                const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
                const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
                
                const cross = [
                    edge1[1] * edge2[2] - edge1[2] * edge2[1],
                    edge1[2] * edge2[0] - edge1[0] * edge2[2],
                    edge1[0] * edge2[1] - edge1[1] * edge2[0]
                ];
                
                const triangleArea = 0.5 * Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2);
                area += triangleArea;
            }
        }
        
        return area;
    }

    calculateCenterOfMass(vertices) {
        let cx = 0, cy = 0, cz = 0;
        
        for (const v of vertices) {
            cx += v[0];
            cy += v[1];
            cz += v[2];
        }
        
        const count = vertices.length;
        return [cx / count, cy / count, cz / count];
    }

    calculateComplexity(triangleCount, surfaceArea, volume) {
        // Complexity score based on various factors
        const triangleComplexity = Math.log10(triangleCount + 1);
        const surfaceToVolumeRatio = volume > 0 ? surfaceArea / Math.pow(volume, 2/3) : 0;
        
        // Higher ratio = more complex (thin walls, intricate details)
        const complexity = triangleComplexity * (1 + surfaceToVolumeRatio / 10);
        
        return {
            score: complexity.toFixed(2),
            level: complexity < 2 ? 'Simple' : complexity < 4 ? 'Moderate' : complexity < 6 ? 'Complex' : 'Very Complex',
            triangleDensity: (triangleCount / surfaceArea * 100).toFixed(2) // triangles per cm²
        };
    }

    calculatePrintMetrics(analysis, options = {}) {
        const material = options.material || 'PLA';
        const profile = options.profile || 'standard';
        const printer = options.printer || 'Bambu X1C';
        const quantity = options.quantity || 1;
        
        const settings = this.printProfiles[profile];
        const printerSpec = this.printerSpecs[printer];
        const density = this.materialDensities[material];
        
        // Validate analysis has required data
        if (!analysis.volume || !analysis.surfaceArea || !analysis.dimensions) {
            console.error('Invalid analysis data:', analysis);
            throw new Error('Analysis data is incomplete');
        }
        
        // Volume in cm³ (from mm³)
        const volumeCm3 = analysis.volume / 1000;
        
        // Calculate part weight with accurate infill calculation
        const solidWeight = volumeCm3 * density;
        
        // More accurate weight calculation:
        // Shell weight = perimeter shells * wall thickness
        // Infill weight = internal volume * infill percentage
        const wallThickness = settings.wallCount * settings.layerHeight * 2; // Approximate wall thickness
        const shellVolume = (analysis.surfaceArea / 1000) * (wallThickness / 10); // Convert to cm³
        const internalVolume = Math.max(0, volumeCm3 - shellVolume);
        const shellWeight = shellVolume * density;
        const infillWeight = internalVolume * (settings.infill / 100) * density;
        const partWeight = shellWeight + infillWeight;
        
        // Calculate print time
        const printTime = this.estimatePrintTime(analysis, settings, printerSpec);
        
        // Calculate number of beds needed
        const bedsNeeded = this.calculateBedsNeeded(analysis.dimensions, printerSpec.bedSize, quantity);
        
        // Enhanced support calculation based on overhang analysis
        const supportData = this.calculateSupportMaterial(analysis, settings, density);
        const supportWeight = supportData.weight;
        
        // Calculate total sliced weight (part + supports)
        const slicedWeight = partWeight + supportWeight;
        
        // Material usage for all parts
        const totalWeight = slicedWeight * quantity;
        
        // Cost calculations
        const materialCostPerKg = this.getMaterialCost(material);
        const materialCost = (totalWeight / 1000) * materialCostPerKg;
        
        return {
            ...analysis,
            printSettings: {
                material,
                profile,
                printer,
                quantity,
                layerHeight: settings.layerHeight,
                infill: settings.infill,
                wallCount: settings.wallCount,
                printSpeed: settings.speed
            },
            metrics: {
                volumeCm3: volumeCm3.toFixed(2),
                weight: {
                    part: partWeight.toFixed(1),
                    support: supportWeight.toFixed(1),
                    slicedPerPart: slicedWeight.toFixed(1),
                    total: totalWeight.toFixed(1),
                    unit: 'grams'
                },
                printTime: {
                    perPart: printTime.hours.toFixed(1),
                    total: (printTime.hours * quantity).toFixed(1),
                    formatted: this.formatTime(printTime.hours * quantity),
                    unit: 'hours'
                },
                beds: {
                    required: bedsNeeded,
                    utilization: this.calculateBedUtilization(analysis.dimensions, printerSpec.bedSize, quantity, bedsNeeded)
                },
                supportRequired: supportData.needed,
                supportType: supportData.type,
                materialLength: {
                    value: (totalWeight / (Math.PI * Math.pow(0.875, 2) * density)).toFixed(0), // 1.75mm filament
                    unit: 'mm'
                }
            },
            cost: {
                material: materialCost.toFixed(2),
                currency: 'USD'
            }
        };
    }

    estimatePrintTime(analysis, settings, printerSpec) {
        // Complex print time estimation based on geometry and settings
        const volume = analysis.volume / 1000; // cm³
        const surfaceArea = analysis.surfaceArea / 100; // cm²
        const layerCount = analysis.dimensions.z / settings.layerHeight;
        
        // Base time calculations
        const extrusionVolume = volume * (settings.infill / 100 + 0.3); // Including shells
        const travelDistance = surfaceArea * layerCount * 0.1; // Approximate travel
        
        // Time components
        const extrusionTime = extrusionVolume / (settings.speed * 0.1); // hours
        const travelTime = travelDistance / (printerSpec.maxSpeed * 60); // hours
        const layerChangeTime = layerCount * 2 / 3600; // 2 seconds per layer
        
        // Complexity factor
        const complexityMultiplier = analysis.complexity?.score ? 1 + (parseFloat(analysis.complexity.score) - 2) * 0.1 : 1;
        
        const totalHours = (extrusionTime + travelTime + layerChangeTime) * complexityMultiplier;
        
        return {
            hours: totalHours,
            breakdown: {
                extrusion: extrusionTime.toFixed(2),
                travel: travelTime.toFixed(2),
                layerChanges: layerChangeTime.toFixed(2),
                complexity: complexityMultiplier.toFixed(2)
            }
        };
    }

    calculateBedsNeeded(dimensions, bedSize, quantity) {
        // Simple packing algorithm
        const partFootprint = dimensions.x * dimensions.y;
        const bedArea = bedSize[0] * bedSize[1];
        
        // Check if part fits on bed
        if (dimensions.x > bedSize[0] || dimensions.y > bedSize[1] || dimensions.z > bedSize[2]) {
            return -1; // Part too large
        }
        
        // Calculate how many parts fit per bed
        const partsPerBed = Math.floor(bedArea / (partFootprint * 1.2)); // 20% spacing
        
        return Math.ceil(quantity / partsPerBed);
    }

    calculateBedUtilization(dimensions, bedSize, quantity, bedsNeeded) {
        if (bedsNeeded === -1) return 0;
        
        const partVolume = dimensions.x * dimensions.y * dimensions.z;
        const bedVolume = bedSize[0] * bedSize[1] * bedSize[2];
        
        const utilization = (partVolume * quantity) / (bedVolume * bedsNeeded) * 100;
        return Math.min(utilization, 100).toFixed(1);
    }

    calculateSupportMaterial(analysis, settings, density) {
        // Enhanced support calculation with different support types
        const geometricCenter = [
            (analysis.boundingBox.min[0] + analysis.boundingBox.max[0]) / 2,
            (analysis.boundingBox.min[1] + analysis.boundingBox.max[1]) / 2,
            (analysis.boundingBox.min[2] + analysis.boundingBox.max[2]) / 2
        ];
        
        const offset = Math.sqrt(
            Math.pow(analysis.centerOfMass[0] - geometricCenter[0], 2) +
            Math.pow(analysis.centerOfMass[1] - geometricCenter[1], 2) +
            Math.pow(analysis.centerOfMass[2] - geometricCenter[2], 2)
        );
        
        const maxDimension = Math.max(analysis.dimensions.x, analysis.dimensions.y, analysis.dimensions.z);
        const volumeCm3 = analysis.volume / 1000;
        
        // Determine if support is needed and type
        let supportType = 'none';
        let supportPercentage = 0;
        
        // Calculate overhang ratio
        const overhangRatio = offset / maxDimension;
        
        if (overhangRatio > 0.15) {
            // Heavy support needed
            supportType = 'tree';
            supportPercentage = 0.25; // 25% of part volume for tree supports
        } else if (overhangRatio > 0.1) {
            // Medium support needed
            supportType = 'normal';
            supportPercentage = 0.18; // 18% of part volume for normal supports
        } else if (overhangRatio > 0.05) {
            // Light support needed
            supportType = 'light';
            supportPercentage = 0.10; // 10% of part volume for light supports
        }
        
        // Check for bridging requirements (horizontal spans)
        const aspectRatio = analysis.dimensions.x / analysis.dimensions.z;
        if (aspectRatio > 3 || analysis.dimensions.y / analysis.dimensions.z > 3) {
            // Long horizontal spans likely need support
            if (supportType === 'none') {
                supportType = 'light';
                supportPercentage = 0.08;
            } else {
                supportPercentage += 0.05; // Add 5% for bridging
            }
        }
        
        // Calculate support volume and weight
        const supportVolume = volumeCm3 * supportPercentage;
        
        // Support typically uses lower density (grid pattern)
        const supportDensity = 0.15; // 15% density for support structure
        const supportWeight = supportVolume * density * supportDensity;
        
        return {
            needed: supportType !== 'none',
            type: supportType,
            percentage: (supportPercentage * 100).toFixed(1),
            volume: supportVolume.toFixed(2),
            weight: supportWeight,
            estimatedRemovalTime: supportWeight > 10 ? Math.ceil(supportWeight / 10) : 1 // minutes
        };
    }
    
    checkSupportNeeded(analysis) {
        // Simplified check for backward compatibility
        const supportData = this.calculateSupportMaterial(analysis, { infill: 20 }, 1.24);
        return supportData.needed;
    }

    getMaterialCost(material) {
        // Cost per kg in USD
        const costs = {
            'PLA': 20,
            'ABS': 22,
            'PETG': 25,
            'TPU': 35,
            'Nylon': 40,
            'ASA': 28,
            'PC': 45,
            'PVA': 60,
            'HIPS': 20,
            'PP': 25,
            'Resin': 30
        };
        
        return costs[material] || 25;
    }

    formatTime(hours) {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        
        if (h === 0) return `${m}m`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}m`;
    }

    async generateQuote(analysis, options = {}) {
        const laborRate = options.laborRate || 25; // $/hour
        const markup = options.markup || 2.5; // 150% markup
        const rushMultiplier = options.rush ? 1.5 : 1;
        const shipping = options.shipping || 0;
        
        const printTime = parseFloat(analysis.metrics.printTime.total);
        const materialCost = parseFloat(analysis.cost.material);
        
        // Calculate costs
        const machineCost = printTime * 2.5; // $2.50/hour machine time
        const laborCost = Math.max(0.5 * laborRate, printTime * 0.1 * laborRate); // Min 30 min labor
        const electricityCost = printTime * 0.5; // $0.50/hour electricity
        
        const baseCost = materialCost + machineCost + laborCost + electricityCost;
        const subtotal = baseCost * markup * rushMultiplier;
        const total = subtotal + shipping;
        
        return {
            breakdown: {
                material: materialCost.toFixed(2),
                machine: machineCost.toFixed(2),
                labor: laborCost.toFixed(2),
                electricity: electricityCost.toFixed(2),
                rush: options.rush ? ((baseCost * markup * 0.5)).toFixed(2) : '0.00',
                shipping: shipping.toFixed(2)
            },
            subtotal: subtotal.toFixed(2),
            total: total.toFixed(2),
            currency: 'USD',
            deliveryDays: options.rush ? 2 : 5,
            validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        };
    }
}

module.exports = File3DAnalyzer;