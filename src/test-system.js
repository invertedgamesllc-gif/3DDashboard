const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Test configuration
const SERVER_URL = 'http://localhost:3001';
const TEST_DIR = path.join(__dirname, 'test-files');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m'
};

// Create test STL file (simple cube)
async function createTestSTL() {
    const stlContent = `solid Cube
        facet normal 0 0 -1
            outer loop
                vertex 0 0 0
                vertex 10 0 0
                vertex 10 10 0
            endloop
        endfacet
        facet normal 0 0 -1
            outer loop
                vertex 0 0 0
                vertex 10 10 0
                vertex 0 10 0
            endloop
        endfacet
        facet normal 0 0 1
            outer loop
                vertex 0 0 10
                vertex 10 10 10
                vertex 10 0 10
            endloop
        endfacet
        facet normal 0 0 1
            outer loop
                vertex 0 0 10
                vertex 0 10 10
                vertex 10 10 10
            endloop
        endfacet
        facet normal 0 -1 0
            outer loop
                vertex 0 0 0
                vertex 10 0 10
                vertex 10 0 0
            endloop
        endfacet
        facet normal 0 -1 0
            outer loop
                vertex 0 0 0
                vertex 0 0 10
                vertex 10 0 10
            endloop
        endfacet
        facet normal 1 0 0
            outer loop
                vertex 10 0 0
                vertex 10 0 10
                vertex 10 10 10
            endloop
        endfacet
        facet normal 1 0 0
            outer loop
                vertex 10 0 0
                vertex 10 10 10
                vertex 10 10 0
            endloop
        endfacet
        facet normal 0 1 0
            outer loop
                vertex 0 10 0
                vertex 10 10 0
                vertex 10 10 10
            endloop
        endfacet
        facet normal 0 1 0
            outer loop
                vertex 0 10 0
                vertex 10 10 10
                vertex 0 10 10
            endloop
        endfacet
        facet normal -1 0 0
            outer loop
                vertex 0 0 0
                vertex 0 10 0
                vertex 0 10 10
            endloop
        endfacet
        facet normal -1 0 0
            outer loop
                vertex 0 0 0
                vertex 0 10 10
                vertex 0 0 10
            endloop
        endfacet
    endsolid Cube`;
    
    await fs.mkdir(TEST_DIR, { recursive: true });
    const filePath = path.join(TEST_DIR, 'test-cube.stl');
    await fs.writeFile(filePath, stlContent);
    return filePath;
}

// Create test OBJ file
async function createTestOBJ() {
    const objContent = `# Simple cube OBJ file
v 0 0 0
v 10 0 0
v 10 10 0
v 0 10 0
v 0 0 10
v 10 0 10
v 10 10 10
v 0 10 10

# Faces
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1`;
    
    await fs.mkdir(TEST_DIR, { recursive: true });
    const filePath = path.join(TEST_DIR, 'test-cube.obj');
    await fs.writeFile(filePath, objContent);
    return filePath;
}

// Test file analysis endpoint
async function testFileAnalysis() {
    console.log(`${colors.blue}Testing file analysis endpoint...${colors.reset}`);
    
    try {
        // Create test files
        const stlPath = await createTestSTL();
        const objPath = await createTestOBJ();
        
        // Test STL file
        console.log(`${colors.yellow}Testing STL file...${colors.reset}`);
        const stlData = await fs.readFile(stlPath);
        const stlForm = new FormData();
        stlForm.append('files', stlData, 'test-cube.stl');
        stlForm.append('material', 'PLA');
        stlForm.append('quantity', '1');
        
        const stlResponse = await fetch(`${SERVER_URL}/api/analyze-multiple-files`, {
            method: 'POST',
            body: stlForm
        });
        
        if (stlResponse.ok) {
            const stlResult = await stlResponse.json();
            console.log(`${colors.green}✓ STL analysis successful${colors.reset}`);
            console.log('  Weight:', stlResult.summary?.totalWeight, 'g');
            console.log('  Time:', stlResult.summary?.totalTime, 'hours');
            console.log('  Beds:', stlResult.summary?.totalBeds);
        } else {
            console.log(`${colors.red}✗ STL analysis failed:${colors.reset}`, await stlResponse.text());
        }
        
        // Test OBJ file
        console.log(`${colors.yellow}Testing OBJ file...${colors.reset}`);
        const objData = await fs.readFile(objPath);
        const objForm = new FormData();
        objForm.append('files', objData, 'test-cube.obj');
        objForm.append('material', 'PETG');
        objForm.append('quantity', '2');
        
        const objResponse = await fetch(`${SERVER_URL}/api/analyze-multiple-files`, {
            method: 'POST',
            body: objForm
        });
        
        if (objResponse.ok) {
            const objResult = await objResponse.json();
            console.log(`${colors.green}✓ OBJ analysis successful${colors.reset}`);
            console.log('  Weight:', objResult.summary?.totalWeight, 'g');
            console.log('  Time:', objResult.summary?.totalTime, 'hours');
            console.log('  Beds:', objResult.summary?.totalBeds);
        } else {
            console.log(`${colors.red}✗ OBJ analysis failed:${colors.reset}`, await objResponse.text());
        }
        
        // Clean up test files
        await fs.rm(TEST_DIR, { recursive: true, force: true });
        
    } catch (error) {
        console.error(`${colors.red}Test failed:${colors.reset}`, error.message);
    }
}

// Test material management endpoints
async function testMaterialManagement() {
    console.log(`\n${colors.blue}Testing material management endpoints...${colors.reset}`);
    
    try {
        // Test get materials
        console.log(`${colors.yellow}Getting materials...${colors.reset}`);
        const getMaterialsResponse = await fetch(`${SERVER_URL}/api/materials`);
        
        if (getMaterialsResponse.ok) {
            const materials = await getMaterialsResponse.json();
            console.log(`${colors.green}✓ Get materials successful${colors.reset}`);
            console.log('  Materials count:', Object.keys(materials).length);
        } else {
            console.log(`${colors.red}✗ Get materials failed${colors.reset}`);
        }
        
        // Test update material cost
        console.log(`${colors.yellow}Updating material cost...${colors.reset}`);
        const updateResponse = await fetch(`${SERVER_URL}/api/materials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                PLA: { 
                    cost: 25.99, 
                    colors: ['White', 'Black', 'Red', 'Blue'], 
                    inventory: { White: 5, Black: 3, Red: 2, Blue: 4 } 
                }
            })
        });
        
        if (updateResponse.ok) {
            console.log(`${colors.green}✓ Update materials successful${colors.reset}`);
        } else {
            console.log(`${colors.red}✗ Update materials failed${colors.reset}`);
        }
        
    } catch (error) {
        console.error(`${colors.red}Material management test failed:${colors.reset}`, error.message);
    }
}

// Test server health
async function testServerHealth() {
    console.log(`\n${colors.blue}Testing server health...${colors.reset}`);
    
    try {
        const response = await fetch(`${SERVER_URL}/api/materials`);
        if (response.ok || response.status === 404) {
            console.log(`${colors.green}✓ Server is running${colors.reset}`);
            return true;
        } else {
            console.log(`${colors.red}✗ Server returned status:${colors.reset}`, response.status);
            return false;
        }
    } catch (error) {
        console.log(`${colors.red}✗ Server is not running${colors.reset}`);
        console.log(`  Please start the server with: npm start`);
        console.log(`  Error:`, error.message);
        return false;
    }
}

// Main test runner
async function runTests() {
    console.log(`${colors.blue}═══════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.blue}    3D Print Automation System Test Suite   ${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════════${colors.reset}\n`);
    
    // Check server health first
    const serverRunning = await testServerHealth();
    if (!serverRunning) {
        console.log(`\n${colors.red}Tests aborted: Server is not running${colors.reset}`);
        process.exit(1);
    }
    
    // Run test suites
    await testFileAnalysis();
    await testMaterialManagement();
    
    console.log(`\n${colors.blue}═══════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}    All tests completed!${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════════${colors.reset}`);
}

// Run tests
runTests().catch(console.error);