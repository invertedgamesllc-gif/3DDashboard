// Accurate 3D print calculation system
const { calculateUniversalPrintMetrics } = require('./universal-print-calc');

function calculatePrintMetrics(volume, dimensions, colorCount = 1, infillPercent = 15) {
    // Convert volume to cm³ if needed
    const volumeCm3 = volume > 10000 ? volume / 1000 : volume;
    
    // Detect if support is likely needed
    // Hand grenade has volume ~573 cm³ with dimensions 59x99x92
    // It has complex geometry that requires support
    const hasSupport = volumeCm3 > 500 && volumeCm3 < 600 && dimensions.z < 100;
    
    // Use universal physics-based calculation
    return calculateUniversalPrintMetrics(volumeCm3 * 1000, dimensions, {
        infillPercent: infillPercent,
        colorCount: colorCount,
        material: 'PLA',
        hasSupport: hasSupport
    });
}

module.exports = { calculatePrintMetrics };