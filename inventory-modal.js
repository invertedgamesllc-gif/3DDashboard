// Clean Add Material Modal Function
window.showAddMaterialModal = function() {
    // Remove any existing modal
    const existingModal = document.getElementById('addMaterialModal');
    if (existingModal) existingModal.remove();
    
    // Create modal wrapper
    const modal = document.createElement('div');
    modal.id = 'addMaterialModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);';
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'background:#1a1a2e;border-radius:20px;padding:2rem;width:500px;max-width:90%;max-height:80vh;overflow-y:auto;position:relative;box-shadow:0 20px 40px rgba(0,0,0,0.5);';
    
    // Modal HTML
    modalContent.innerHTML = `
        <h2 style='color:#8b5cf6;margin-bottom:1.5rem;font-size:1.5rem;font-weight:700;'>Add New Material</h2>
        <button onclick='document.getElementById("addMaterialModal").remove()' style='position:absolute;top:1rem;right:1rem;background:rgba(255,255,255,0.1);border:none;color:white;width:30px;height:30px;border-radius:5px;cursor:pointer;font-size:20px;'>×</button>
        
        <div style='margin-bottom:1rem'>
            <label style='display:block;margin-bottom:0.5rem;color:#a0a0b8;font-size:0.875rem;font-weight:500;'>Material Type</label>
            <select id='mat_type' style='width:100%;padding:0.75rem;background:#0d0d15;border:1px solid rgba(139,92,246,0.3);color:#e0e0e0;border-radius:8px;font-size:14px;'>
                <option value='PLA'>PLA</option>
                <option value='PETG'>PETG</option>
                <option value='ABS'>ABS</option>
                <option value='TPU'>TPU</option>
            </select>
        </div>
        
        <div style='margin-bottom:1rem'>
            <label style='display:block;margin-bottom:0.5rem;color:#a0a0b8;font-size:0.875rem;font-weight:500;'>Color</label>
            <div style='display:flex;gap:0.5rem;align-items:center;'>
                <select id='mat_color' style='flex:1;padding:0.75rem;background:#0d0d15;border:1px solid rgba(139,92,246,0.3);color:#e0e0e0;border-radius:8px;font-size:14px;'>
                    <option value=''>-- Select Color --</option>
                    <option value='Black'>⚫ Black</option>
                    <option value='White'>⚪ White</option>
                    <option value='Gray'>🔘 Gray</option>
                    <option value='Silver'>⚪ Silver</option>
                    <option value='Red'>🔴 Red</option>
                    <option value='Blue'>🔵 Blue</option>
                    <option value='Navy Blue'>🔵 Navy Blue</option>
                    <option value='Green'>🟢 Green</option>
                    <option value='Yellow'>🟡 Yellow</option>
                    <option value='Orange'>🟠 Orange</option>
                    <option value='Purple'>🟣 Purple</option>
                    <option value='Pink'>🩷 Pink</option>
                    <option value='Brown'>🟤 Brown</option>
                    <option value='Gold'>🟡 Gold</option>
                    <option value='Transparent'>💎 Transparent</option>
                    <option value='Natural'>🏻 Natural</option>
                    <option value='Custom'>🎨 Custom Color</option>
                </select>
                <div style='position:relative;'>
                    <input type='color' id='mat_color_hex' value='#8b5cf6' style='width:60px;height:40px;border:2px solid rgba(139,92,246,0.3);border-radius:8px;cursor:pointer;background:#0d0d15;'>
                    <div style='position:absolute;bottom:-25px;left:50%;transform:translateX(-50%);font-size:10px;color:#888;white-space:nowrap;'>Pick Color</div>
                </div>
            </div>
            <input type='text' id='mat_color_custom' placeholder='Enter custom color name' style='width:100%;padding:0.75rem;background:#0d0d15;border:1px solid rgba(139,92,246,0.3);color:#e0e0e0;border-radius:8px;margin-top:0.5rem;display:none;font-size:14px;'>
            <div id='selected_color_preview' style='margin-top:0.75rem;padding:0.5rem;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:6px;display:none;'>
                <div style='display:flex;align-items:center;gap:0.5rem;'>
                    <div id='color_swatch' style='width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);'></div>
                    <span id='color_name' style='font-size:13px;color:#e0e0e0;'></span>
                </div>
            </div>
        </div>
        
        <div style='margin-bottom:1rem'>
            <label style='display:block;margin-bottom:0.5rem;color:#a0a0b8;font-size:0.875rem;font-weight:500;'>Brand</label>
            <select id='mat_brand' style='width:100%;padding:0.75rem;background:#0d0d15;border:1px solid rgba(139,92,246,0.3);color:#e0e0e0;border-radius:8px;font-size:14px;'>
                <option value=''>-- Select Brand --</option>
                <option value='Bambu Lab'>Bambu Lab</option>
                <option value='Prusament'>Prusament</option>
                <option value='eSUN'>eSUN</option>
                <option value='SUNLU'>SUNLU</option>
                <option value='Polymaker'>Polymaker</option>
                <option value='ELEGOO'>ELEGOO</option>
                <option value='Overture'>Overture</option>
                <option value='AMOLEN'>AMOLEN</option>
                <option value='Hatchbox'>Hatchbox</option>
                <option value='Proto-pasta'>Proto-pasta</option>
                <option value='Creality'>Creality</option>
                <option value='Custom'>Custom (Type Below)</option>
            </select>
            <input type='text' id='mat_brand_custom' placeholder='Enter custom brand' style='width:100%;padding:0.75rem;background:#0d0d15;border:1px solid rgba(139,92,246,0.3);color:#e0e0e0;border-radius:8px;margin-top:0.5rem;display:none;font-size:14px;'>
        </div>
        
        <div style='margin-bottom:1rem'>
            <label style='display:block;margin-bottom:0.5rem;color:#a0a0b8;font-size:0.875rem;font-weight:500;'>Weight (g)</label>
            <input type='number' id='mat_weight' value='1000' style='width:100%;padding:0.75rem;background:#0d0d15;border:1px solid rgba(139,92,246,0.3);color:#e0e0e0;border-radius:8px;font-size:14px;'>
        </div>
        
        <div style='margin-bottom:1rem'>
            <label style='display:block;margin-bottom:0.5rem;color:#a0a0b8;font-size:0.875rem;font-weight:500;'>Cost ($)</label>
            <input type='number' id='mat_cost' step='0.01' value='25.00' style='width:100%;padding:0.75rem;background:#0d0d15;border:1px solid rgba(139,92,246,0.3);color:#e0e0e0;border-radius:8px;font-size:14px;'>
        </div>
        
        <div style='display:flex;gap:1rem;margin-top:1.5rem'>
            <button onclick='document.getElementById("addMaterialModal").remove()' style='flex:1;padding:0.75rem;background:rgba(255,255,255,0.1);border:none;color:white;border-radius:8px;cursor:pointer;font-weight:600;transition:all 0.3s;'>Cancel</button>
            <button onclick='saveNewMaterial()' style='flex:1;padding:0.75rem;background:linear-gradient(135deg,#8b5cf6,#ec4899);border:none;color:white;border-radius:8px;cursor:pointer;font-weight:600;transition:all 0.3s;'>Add Material</button>
        </div>
    `;
    
    // Add modal content to modal
    modal.appendChild(modalContent);
    
    // Add to page
    document.body.appendChild(modal);
    
    // Click outside to close
    modal.onclick = function(e) {
        if (e.target === modal) modal.remove();
    };
    
    // Setup custom field handlers
    const colorSelect = document.getElementById('mat_color');
    const colorCustom = document.getElementById('mat_color_custom');
    const colorHex = document.getElementById('mat_color_hex');
    const brandSelect = document.getElementById('mat_brand');
    const brandCustom = document.getElementById('mat_brand_custom');
    const colorPreview = document.getElementById('selected_color_preview');
    const colorSwatch = document.getElementById('color_swatch');
    const colorName = document.getElementById('color_name');
    
    // Predefined color hex values
    const colorMap = {
        'Black': '#000000',
        'White': '#FFFFFF',
        'Gray': '#808080',
        'Silver': '#C0C0C0',
        'Red': '#FF0000',
        'Blue': '#0000FF',
        'Navy Blue': '#000080',
        'Green': '#00FF00',
        'Yellow': '#FFFF00',
        'Orange': '#FFA500',
        'Purple': '#800080',
        'Pink': '#FFC0CB',
        'Brown': '#8B4513',
        'Gold': '#FFD700',
        'Transparent': '#E0E0E0',
        'Natural': '#F5DEB3'
    };
    
    // Update color preview
    function updateColorPreview() {
        const selectedColor = colorSelect.value;
        const hexColor = colorHex.value;
        
        if (selectedColor || hexColor !== '#8b5cf6') {
            colorPreview.style.display = 'block';
            colorSwatch.style.background = hexColor;
            
            if (selectedColor === 'Custom') {
                colorName.textContent = colorCustom.value || 'Custom Color';
            } else {
                colorName.textContent = selectedColor || 'Selected Color';
            }
        } else {
            colorPreview.style.display = 'none';
        }
    }
    
    colorSelect.onchange = function() {
        colorCustom.style.display = this.value === 'Custom' ? 'block' : 'none';
        
        if (this.value === 'Custom') {
            colorCustom.focus();
        } else if (this.value && colorMap[this.value]) {
            // Update color picker to match selected color
            colorHex.value = colorMap[this.value];
        }
        
        updateColorPreview();
    };
    
    colorHex.oninput = function() {
        updateColorPreview();
    };
    
    colorCustom.oninput = function() {
        updateColorPreview();
    };
    
    brandSelect.onchange = function() {
        brandCustom.style.display = this.value === 'Custom' ? 'block' : 'none';
        if (this.value === 'Custom') brandCustom.focus();
    };
}

// Save new material function
window.saveNewMaterial = function() {
    console.log('saveNewMaterial called');
    
    const modal = document.getElementById('addMaterialModal');
    if (!modal) {
        console.error('Modal not found');
        return;
    }
    
    // Get values
    const colorSelect = document.getElementById('mat_color');
    const colorHex = document.getElementById('mat_color_hex');
    const brandSelect = document.getElementById('mat_brand');
    
    if (!colorSelect || !brandSelect) {
        console.error('Form fields not found');
        return;
    }
    
    let color = colorSelect.value;
    if (color === 'Custom') {
        color = document.getElementById('mat_color_custom').value || 'Custom Color';
    } else if (!color) {
        color = 'Unnamed';
    }
    
    // Get the actual hex color from the color picker
    const actualColorHex = colorHex ? colorHex.value : '#808080';
    
    let brand = brandSelect.value;
    if (brand === 'Custom') {
        brand = document.getElementById('mat_brand_custom').value || 'Generic';
    } else if (!brand) {
        brand = 'Generic';
    }
    
    // Create material object
    const newMaterial = {
        id: 'INV' + Date.now().toString().slice(-6),
        type: document.getElementById('mat_type').value,
        color: color,
        colorHex: actualColorHex,
        brand: brand,
        weight: parseInt(document.getElementById('mat_weight').value) || 1000,
        originalWeight: parseInt(document.getElementById('mat_weight').value) || 1000,
        cost: parseFloat(document.getElementById('mat_cost').value) || 25,
        minStock: 200,
        location: 'Unassigned'
    };
    
    console.log('New material to add:', newMaterial);
    
    // Initialize or fix inventory array
    if (!window.inventory || !Array.isArray(window.inventory)) {
        console.log('Initializing/fixing inventory array');
        // Try to load from localStorage first
        try {
            const stored = localStorage.getItem('inventory');
            window.inventory = stored ? JSON.parse(stored) : [];
            // Ensure it's an array
            if (!Array.isArray(window.inventory)) {
                console.warn('Inventory was not an array, converting...');
                window.inventory = [];
            }
        } catch (e) {
            console.error('Error loading inventory:', e);
            window.inventory = [];
        }
    }
    
    // Add to inventory
    window.inventory.push(newMaterial);
    console.log('Material added to inventory. Total items:', window.inventory.length);
    
    // Save to localStorage
    localStorage.setItem('inventory', JSON.stringify(window.inventory));
    
    // Update display functions - try multiple times as they might load later
    setTimeout(() => {
        if (typeof window.saveInventory === 'function') {
            window.saveInventory();
            console.log('saveInventory called');
        } else {
            // Fallback - manually save
            localStorage.setItem('inventory', JSON.stringify(window.inventory));
            console.log('Manually saved to localStorage');
        }
        
        if (typeof window.refreshInventoryDisplay === 'function') {
            window.refreshInventoryDisplay();
            console.log('refreshInventoryDisplay called');
        } else if (typeof window.displayInventory === 'function') {
            window.displayInventory();
            console.log('displayInventory called');
        } else {
            // Try to refresh the inventory grid directly
            const inventoryGrid = document.getElementById('inventoryGrid');
            if (inventoryGrid && window.inventory) {
                console.log('Attempting manual display refresh');
                // Force a refresh by toggling visibility
                inventoryGrid.style.display = 'none';
                setTimeout(() => {
                    inventoryGrid.style.display = 'grid';
                }, 10);
            }
        }
        
        if (typeof window.updateInventoryStats === 'function') {
            window.updateInventoryStats();
            console.log('updateInventoryStats called');
        } else {
            // Manually update stats
            const totalValue = window.inventory.reduce((sum, item) => sum + (item.weight / 1000 * item.cost), 0);
            const totalMaterialsEl = document.getElementById('totalMaterials');
            const totalValueEl = document.getElementById('totalInventoryValue');
            
            if (totalMaterialsEl) {
                totalMaterialsEl.textContent = window.inventory.length;
                console.log('Manually updated total materials:', window.inventory.length);
            }
            if (totalValueEl) {
                totalValueEl.textContent = `$${totalValue.toFixed(2)}`;
                console.log('Manually updated total value:', totalValue);
            }
        }
    }, 100);
    
    if (typeof window.showNotification === 'function') {
        window.showNotification(`✅ Added ${newMaterial.type} - ${newMaterial.color}`, 'success');
    } else {
        // Fallback notification
        alert(`✅ Added ${newMaterial.type} - ${newMaterial.color}`);
    }
    
    // Close modal
    modal.remove();
    console.log('Modal closed');
    
    // Force a complete refresh of the inventory tab after a short delay
    setTimeout(() => {
        // Trigger a click on the inventory tab to force refresh
        const inventoryTab = document.querySelector('[data-page="inventory"]');
        if (inventoryTab) {
            console.log('Forcing inventory tab refresh');
            inventoryTab.click();
        } else {
            // Alternative: reload the page if we're on the inventory tab
            const activeTab = document.querySelector('.page-content.active');
            if (activeTab && activeTab.id === 'inventory') {
                console.log('Reloading page to show updated inventory');
                location.reload();
            }
        }
    }, 500);
}