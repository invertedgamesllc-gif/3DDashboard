// Inventory Functions - Load immediately to ensure availability

// Initialize global inventory variables if not already set
if (!window.inventory) {
    window.inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
}
if (!window.currentFilter) {
    window.currentFilter = 'all';
}

// Filter inventory display
window.filterInventory = function(filter) {
    console.log('filterInventory called with:', filter);
    window.currentFilter = filter;
    
    // Update button states
    const inventorySection = document.getElementById('inventory');
    if (inventorySection) {
        const buttons = inventorySection.querySelectorAll('.btn-ghost');
        buttons.forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Find and activate the right button
        let buttonId = 'filter';
        if (filter === 'all') {
            buttonId += 'All';
        } else if (filter === 'low') {
            buttonId += 'Low';
        } else {
            buttonId += filter.toUpperCase();
        }
        
        const activeButton = document.getElementById(buttonId);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }
    
    // Call display function if it exists
    if (typeof window.displayInventory === 'function') {
        window.displayInventory();
    } else {
        console.log('displayInventory not yet loaded, will display when ready');
    }
}

// Export inventory
window.exportInventory = function() {
    console.log('exportInventory called');
    let csv = 'Type,Color,Brand,Current Stock (g),Original Weight (g),Cost,Min Stock (g),Location,Status\n';
    
    window.inventory.forEach(item => {
        const status = item.weight === 0 ? 'Out of Stock' : (item.weight <= item.minStock ? 'Low Stock' : 'In Stock');
        csv += `${item.type},${item.color},${item.brand},${item.weight},${item.originalWeight},${item.cost},${item.minStock},${item.location},${status}\n`;
    });
    
    // Create download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    if (typeof window.showNotification === 'function') {
        window.showNotification('📥 Inventory exported to CSV', 'success');
    }
}

// Show reprint modal
window.showReprintModal = function() {
    console.log('showReprintModal called');
    alert('Reprint modal - This feature will track material usage for failed prints');
}

console.log('Inventory functions loaded and available globally');