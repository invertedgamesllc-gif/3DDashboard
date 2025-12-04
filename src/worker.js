// Cloudflare Worker API for 3D Print Business
// Handles all database operations and file storage

// Simple password hashing (for production, use a proper library like bcrypt via Web Crypto)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'etsy3dprint-salt-2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hash) {
    const passwordHash = await hashPassword(password);
    return passwordHash === hash;
}

// Generate session token
function generateSessionToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Get user from session token
async function getUserFromSession(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    const session = await env.DB.prepare(
        "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
    ).bind(token).first();

    if (!session) {
        return null;
    }

    const user = await env.DB.prepare(
        "SELECT id, username, email, role, display_name, is_active FROM users WHERE id = ? AND is_active = 1"
    ).bind(session.user_id).first();

    return user;
}

// Log user activity
async function logActivity(env, userId, action, entityType = null, entityId = null, details = null) {
    try {
        await env.DB.prepare(
            "INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)"
        ).bind(userId, action, entityType, entityId, details).run();
    } catch (e) {
        console.error('Failed to log activity:', e);
    }
}

export default {
    async fetch(request, env, ctx) {
        // Enable CORS
        const corsHeaders = {
            'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // Handle preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // Auth endpoints (no auth required)
            if (path === '/api/auth/login' && request.method === 'POST') {
                return await handleLogin(request, env, corsHeaders);
            }

            if (path === '/api/auth/logout' && request.method === 'POST') {
                return await handleLogout(request, env, corsHeaders);
            }

            if (path === '/api/auth/me' && request.method === 'GET') {
                return await handleGetCurrentUser(request, env, corsHeaders);
            }

            if (path === '/api/auth/setup' && request.method === 'POST') {
                return await handleInitialSetup(request, env, corsHeaders);
            }

            // User management endpoints (admin only)
            if (path === '/api/users' && request.method === 'GET') {
                return await handleGetUsers(request, env, corsHeaders);
            }

            if (path === '/api/users' && request.method === 'POST') {
                return await handleCreateUser(request, env, corsHeaders);
            }

            if (path.match(/^\/api\/users\/[^/]+$/) && request.method === 'PUT') {
                const userId = path.split('/')[3];
                return await handleUpdateUser(userId, request, env, corsHeaders);
            }

            if (path.match(/^\/api\/users\/[^/]+$/) && request.method === 'DELETE') {
                const userId = path.split('/')[3];
                return await handleDeleteUser(userId, request, env, corsHeaders);
            }

            // Activity log endpoint
            if (path === '/api/activity' && request.method === 'GET') {
                return await handleGetActivity(request, env, corsHeaders);
            }

            // Route handling
            if (path === '/api/inquiries' && request.method === 'GET') {
                return await handleGetInquiries(env, corsHeaders);
            }

            if (path === '/api/inquiries' && request.method === 'POST') {
                return await handleCreateInquiry(request, env, corsHeaders);
            }

            if (path.startsWith('/api/inquiries/') && request.method === 'GET') {
                const id = path.split('/')[3];
                return await handleGetInquiry(id, env, corsHeaders);
            }

            if (path.startsWith('/api/inquiries/') && request.method === 'DELETE') {
                const id = path.split('/')[3];
                return await handleDeleteInquiry(id, env, corsHeaders);
            }

            if (path.startsWith('/api/inquiries/') && request.method === 'PUT') {
                const id = path.split('/')[3];
                return await handleUpdateInquiry(id, request, env, corsHeaders);
            }

            if (path === '/api/orders' && request.method === 'GET') {
                return await handleGetOrders(env, corsHeaders);
            }

            if (path === '/api/orders' && request.method === 'POST') {
                return await handleCreateOrder(request, env, corsHeaders);
            }

            if (path.startsWith('/api/orders/') && request.method === 'GET') {
                const id = path.split('/')[3];
                return await handleGetOrder(id, env, corsHeaders);
            }

            if (path.startsWith('/api/orders/') && request.method === 'PUT') {
                const id = path.split('/')[3];
                return await handleUpdateOrder(id, request, env, corsHeaders);
            }

            if (path.startsWith('/api/orders/') && request.method === 'DELETE') {
                const id = path.split('/')[3];
                return await handleDeleteOrder(id, env, corsHeaders);
            }

            // Printers API endpoints
            if (path === '/api/printers' && request.method === 'GET') {
                return await handleGetPrinters(env, corsHeaders);
            }

            if (path === '/api/printers' && request.method === 'POST') {
                return await handleCreatePrinter(request, env, corsHeaders);
            }

            if (path.startsWith('/api/printers/') && request.method === 'GET') {
                const id = path.split('/')[3];
                return await handleGetPrinter(id, env, corsHeaders);
            }

            if (path.startsWith('/api/printers/') && request.method === 'PUT') {
                const id = path.split('/')[3];
                return await handleUpdatePrinter(id, request, env, corsHeaders);
            }

            if (path.startsWith('/api/printers/') && request.method === 'DELETE') {
                const id = path.split('/')[3];
                return await handleDeletePrinter(id, env, corsHeaders);
            }

            // Inventory API endpoints
            if (path === '/api/inventory' && request.method === 'GET') {
                return await handleGetInventory(env, corsHeaders);
            }

            if (path === '/api/inventory' && request.method === 'POST') {
                return await handleCreateInventoryItem(request, env, corsHeaders);
            }

            if (path.startsWith('/api/inventory/') && request.method === 'GET') {
                const id = path.split('/')[3];
                return await handleGetInventoryItem(id, env, corsHeaders);
            }

            if (path.startsWith('/api/inventory/') && request.method === 'PUT') {
                const id = path.split('/')[3];
                return await handleUpdateInventoryItem(id, request, env, corsHeaders);
            }

            if (path.startsWith('/api/inventory/') && request.method === 'DELETE') {
                const id = path.split('/')[3];
                return await handleDeleteInventoryItem(id, env, corsHeaders);
            }

            if (path === '/api/upload' && request.method === 'POST') {
                return await handleFileUpload(request, env, corsHeaders);
            }

            if (path.startsWith('/api/download/') && request.method === 'GET') {
                const fileKey = path.replace('/api/download/', '');
                return await handleFileDownload(fileKey, env, corsHeaders);
            }

            if (path.startsWith('/api/files/') && request.method === 'DELETE') {
                const fileKey = decodeURIComponent(path.replace('/api/files/', ''));
                return await handleFileDelete(fileKey, env, corsHeaders);
            }

            if (path === '/api/inventory' && request.method === 'GET') {
                return await handleGetInventory(env, corsHeaders);
            }

            if (path === '/api/sync-status' && request.method === 'GET') {
                return await handleSyncStatus(env, corsHeaders);
            }

            if (path === '/api/stats' && request.method === 'GET') {
                return await handleGetStats(env, corsHeaders);
            }

            if (path === '/api/force-cleanup' && request.method === 'DELETE') {
                return await handleForceCleanup(env, corsHeaders);
            }

            // Default 404
            return new Response('Not Found', { status: 404, headers: corsHeaders });

        } catch (error) {
            console.error('Worker error:', error);
            return new Response(
                JSON.stringify({ error: error.message }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }
    },
};

// Get all inquiries
async function handleGetInquiries(env, corsHeaders) {
    const { results } = await env.DB.prepare(
        `SELECT i.*, u.username as created_by_username, u.display_name as created_by_name
         FROM inquiries i
         LEFT JOIN users u ON i.created_by = u.id
         ORDER BY i.created_at DESC`
    ).all();

    // Get files for each inquiry
    for (const inquiry of results) {
        const { results: files } = await env.DB.prepare(
            "SELECT * FROM files WHERE inquiry_id = ?"
        ).bind(inquiry.id).all();
        inquiry.files = files || [];
    }

    return new Response(JSON.stringify({ inquiries: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// Create new inquiry
async function handleCreateInquiry(request, env, corsHeaders) {
    const data = await request.json();
    const id = `INQ-${Date.now()}`;

    // Get current user if logged in
    const currentUser = await getUserFromSession(request, env);
    const createdBy = currentUser ? currentUser.id : null;

    // Parse total quote to number
    let totalQuoteNum = 0;
    if (data.totalQuote) {
        const quoteStr = data.totalQuote.toString().replace(/[$,]/g, '');
        totalQuoteNum = parseFloat(quoteStr) || 0;
    }

    await env.DB.prepare(
        `INSERT INTO inquiries (
            id, customer_name, customer_email, project_description,
            material_weight, print_time, material_type, material_color, total_quote, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        id,
        data.customerName || 'Unknown',
        data.customerEmail || 'no-email@provided.com',
        data.projectDescription || '',
        data.materialWeight || 0,
        data.printTime || 0,
        data.materialType || 'PLA',
        data.materialColor || '',
        totalQuoteNum,
        data.status || 'pending',
        createdBy
    ).run();

    // Log activity if user is logged in
    if (currentUser) {
        await logActivity(env, currentUser.id, 'create_inquiry', 'inquiry', id, data.customerName);
    }

    // Handle files if present
    if (data.files && data.files.length > 0) {
        for (const file of data.files) {
            const fileId = `FILE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await env.DB.prepare(
                `INSERT INTO files (
                    id, inquiry_id, original_name, file_key, file_size, file_type
                ) VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
                fileId,
                id,
                file.originalname || file.name || 'Unknown',  // Try originalname first, then name
                file.filename || file.key || file.serverFilename || fileId,  // Use filename from upload
                file.size || 0,
                file.type || file.mimetype || 'application/octet-stream'
            ).run();
        }
    }

    return new Response(
        JSON.stringify({
            success: true,
            inquiry: { id, ...data }
        }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Get single inquiry
async function handleGetInquiry(id, env, corsHeaders) {
    const inquiry = await env.DB.prepare(
        "SELECT * FROM inquiries WHERE id = ?"
    ).bind(id).first();

    if (!inquiry) {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    // Get associated files
    const { results: files } = await env.DB.prepare(
        "SELECT * FROM files WHERE inquiry_id = ?"
    ).bind(id).all();

    inquiry.files = files;

    return new Response(JSON.stringify(inquiry), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// Update inquiry
async function handleUpdateInquiry(id, request, env, corsHeaders) {
    const data = await request.json();

    // Check if inquiry exists
    const existing = await env.DB.prepare(
        "SELECT * FROM inquiries WHERE id = ?"
    ).bind(id).first();

    if (!existing) {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    // Update inquiry
    await env.DB.prepare(
        `UPDATE inquiries SET
            customer_name = ?,
            customer_email = ?,
            project_description = ?,
            material_weight = ?,
            print_time = ?,
            material_type = ?,
            material_color = ?,
            status = ?,
            total_quote = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).bind(
        data.customerName,
        data.customerEmail,
        data.projectDescription || data.message,
        data.materialWeight,
        data.printTime,
        data.materialType,
        data.materialColor || '',
        data.status,
        data.totalCost || data.total_quote || 0,
        id
    ).run();

    // Delete old files if new files are provided
    if (data.files && data.files.length >= 0) {
        // Delete existing file records
        await env.DB.prepare(
            "DELETE FROM files WHERE inquiry_id = ?"
        ).bind(id).run();

        // Insert new file records
        for (const file of data.files) {
            const fileId = `FILE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await env.DB.prepare(
                `INSERT INTO files (
                    id, inquiry_id, original_name, file_key, file_size, file_type
                ) VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
                fileId,
                id,
                file.originalName || file.name || 'unknown',
                file.cloudflareKey || file.key || '',
                file.size || 0,
                file.type || 'application/octet-stream'
            ).run();
        }
    }

    return new Response(
        JSON.stringify({ success: true, inquiry: { id, ...data } }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Delete file from R2
async function handleFileDelete(fileKey, env, corsHeaders) {
    try {
        // Delete from R2 bucket
        await env.FILES_BUCKET.delete(fileKey);

        return new Response(
            JSON.stringify({ success: true, message: 'File deleted successfully' }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error) {
        console.error('Error deleting file:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to delete file' }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
}

// Get all orders
async function handleGetOrders(env, corsHeaders) {
    const { results } = await env.DB.prepare(
        "SELECT * FROM orders ORDER BY order_date DESC"
    ).all();

    return new Response(JSON.stringify({ orders: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// Create new order
async function handleCreateOrder(request, env, corsHeaders) {
    const data = await request.json();
    const id = data.id || `ORD-${Date.now()}`;

    await env.DB.prepare(
        `INSERT INTO orders (
            id, inquiry_id, customer_name, customer_email,
            material_type, material_color, material_weight,
            total_amount, status, printer_assigned, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        id,
        data.inquiry_id || data.inquiryId || null,
        data.customer_name || data.customerName,
        data.customer_email || data.customerEmail || '',
        data.material_type || data.materialType || 'PLA',
        data.material_color || data.materialColor || '',
        data.material_weight || data.materialWeight || 0,
        data.total || data.totalAmount || 0,
        data.status || 'pending',
        data.assigned_printer || data.printer_assigned || data.printerAssigned || null,
        data.notes || ''
    ).run();

    return new Response(
        JSON.stringify({ success: true, order: { id, ...data } }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Get single order
async function handleGetOrder(id, env, corsHeaders) {
    const order = await env.DB.prepare(
        "SELECT * FROM orders WHERE id = ?"
    ).bind(id).first();

    if (!order) {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    return new Response(JSON.stringify(order), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// Update order
async function handleUpdateOrder(id, request, env, corsHeaders) {
    const data = await request.json();

    // Update order
    await env.DB.prepare(
        `UPDATE orders SET
            customer_name = ?,
            customer_email = ?,
            material_type = ?,
            material_color = ?,
            material_weight = ?,
            status = ?,
            printer_assigned = ?,
            notes = ?
        WHERE id = ?`
    ).bind(
        data.customer_name || data.customerName || '',
        data.customer_email || data.customerEmail || '',
        data.material_type || data.materialType || 'PLA',
        data.material_color || data.materialColor || '',
        data.material_weight || data.materialWeight || 0,
        data.status || 'pending',
        data.printer_assigned || data.printerAssigned || null,
        data.notes || '',
        id
    ).run();

    return new Response(
        JSON.stringify({ success: true, order: { id, ...data } }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Delete order
async function handleDeleteOrder(id, env, corsHeaders) {
    try {
        // First check if order exists
        const order = await env.DB.prepare(
            "SELECT * FROM orders WHERE id = ?"
        ).bind(id).first();

        if (!order) {
            return new Response('Order not found', { status: 404, headers: corsHeaders });
        }

        // Get associated files from inquiry if order is linked to one
        let deletedFilesCount = 0;
        let deletedInquiry = false;
        if (order.inquiry_id) {
            const { results: files } = await env.DB.prepare(
                "SELECT * FROM files WHERE inquiry_id = ?"
            ).bind(order.inquiry_id).all();

            // Delete files from R2 storage
            for (const file of files) {
                if (file.file_key) {
                    try {
                        await env.FILES_BUCKET.delete(file.file_key);
                        console.log(`Deleted R2 file: ${file.file_key}`);
                        deletedFilesCount++;
                    } catch (fileError) {
                        console.error(`Failed to delete R2 file ${file.file_key}:`, fileError);
                    }
                }
            }

            // Delete associated file records from database
            await env.DB.prepare(
                "DELETE FROM files WHERE inquiry_id = ?"
            ).bind(order.inquiry_id).run();

            // Delete the associated inquiry
            await env.DB.prepare(
                "DELETE FROM inquiries WHERE id = ?"
            ).bind(order.inquiry_id).run();
            deletedInquiry = true;
            console.log(`Deleted inquiry ${order.inquiry_id} associated with order ${id}`);
        }

        // Delete the order
        await env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();

        console.log(`Deleted order ${id} with ${deletedFilesCount} R2 files${deletedInquiry ? ' and inquiry' : ''}`);

        return new Response(
            JSON.stringify({
                success: true,
                deletedFiles: deletedFilesCount,
                deletedInquiry: deletedInquiry
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error) {
        console.error('Delete order error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
}

// Get all printers
async function handleGetPrinters(env, corsHeaders) {
    const result = await env.DB.prepare("SELECT * FROM printers ORDER BY name ASC").all();

    return new Response(
        JSON.stringify({ printers: result.results || [] }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Create new printer
async function handleCreatePrinter(request, env, corsHeaders) {
    const data = await request.json();
    const id = data.id || `printer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await env.DB.prepare(
        `INSERT INTO printers (id, name, model, status, current_job_id, last_maintenance, total_print_hours)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        id,
        data.name,
        data.model || null,
        data.status || 'idle',
        data.current_job_id || null,
        data.last_maintenance || null,
        data.total_print_hours || 0
    ).run();

    return new Response(
        JSON.stringify({ success: true, id }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Get single printer
async function handleGetPrinter(id, env, corsHeaders) {
    const printer = await env.DB.prepare(
        "SELECT * FROM printers WHERE id = ?"
    ).bind(id).first();

    if (!printer) {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    return new Response(
        JSON.stringify(printer),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Update printer
async function handleUpdatePrinter(id, request, env, corsHeaders) {
    const data = await request.json();

    await env.DB.prepare(
        `UPDATE printers SET
            name = ?,
            model = ?,
            status = ?,
            current_job_id = ?,
            last_maintenance = ?,
            total_print_hours = ?
        WHERE id = ?`
    ).bind(
        data.name,
        data.model || null,
        data.status || 'idle',
        data.current_job_id || null,
        data.last_maintenance || null,
        data.total_print_hours || 0,
        id
    ).run();

    return new Response(
        JSON.stringify({ success: true }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Delete printer
async function handleDeletePrinter(id, env, corsHeaders) {
    await env.DB.prepare("DELETE FROM printers WHERE id = ?").bind(id).run();

    return new Response(
        JSON.stringify({ success: true }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Get all inventory items
async function handleGetInventory(env, corsHeaders) {
    const result = await env.DB.prepare("SELECT * FROM inventory ORDER BY material_type, color").all();

    return new Response(
        JSON.stringify({ inventory: result.results || [] }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Create new inventory item
async function handleCreateInventoryItem(request, env, corsHeaders) {
    const data = await request.json();

    await env.DB.prepare(
        `INSERT INTO inventory (material_type, color, quantity_kg, price_per_kg, supplier, last_updated)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(
        data.material_type,
        data.color,
        data.quantity_kg || 0,
        data.price_per_kg || 0,
        data.supplier || null
    ).run();

    const result = await env.DB.prepare("SELECT last_insert_rowid() as id").first();

    return new Response(
        JSON.stringify({ success: true, id: result.id }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Get single inventory item
async function handleGetInventoryItem(id, env, corsHeaders) {
    const item = await env.DB.prepare(
        "SELECT * FROM inventory WHERE id = ?"
    ).bind(id).first();

    if (!item) {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    return new Response(
        JSON.stringify(item),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Update inventory item
async function handleUpdateInventoryItem(id, request, env, corsHeaders) {
    const data = await request.json();

    await env.DB.prepare(
        `UPDATE inventory SET
            material_type = ?,
            color = ?,
            quantity_kg = ?,
            price_per_kg = ?,
            supplier = ?,
            last_updated = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).bind(
        data.material_type,
        data.color,
        data.quantity_kg || 0,
        data.price_per_kg || 0,
        data.supplier || null,
        id
    ).run();

    return new Response(
        JSON.stringify({ success: true }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Delete inventory item
async function handleDeleteInventoryItem(id, env, corsHeaders) {
    await env.DB.prepare("DELETE FROM inventory WHERE id = ?").bind(id).run();

    return new Response(
        JSON.stringify({ success: true }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Handle file upload to R2
async function handleFileUpload(request, env, corsHeaders) {
    const formData = await request.formData();
    const files = formData.getAll('files');
    const uploadedFiles = [];

    for (const file of files) {
        if (file instanceof File) {
            // Generate unique key for R2
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substr(2, 9);
            const extension = file.name.split('.').pop();
            const key = `uploads/${timestamp}-${randomStr}.${extension}`;

            // Upload to R2
            await env.FILES_BUCKET.put(key, file.stream(), {
                httpMetadata: {
                    contentType: file.type,
                },
                customMetadata: {
                    originalName: file.name,
                    uploadedAt: new Date().toISOString(),
                },
            });

            uploadedFiles.push({
                originalname: file.name,
                filename: key,
                size: file.size,
                mimetype: file.type,
                path: key,
            });
        }
    }

    return new Response(
        JSON.stringify({
            success: true,
            files: uploadedFiles
        }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

// Handle file download from R2
async function handleFileDownload(fileKey, env, corsHeaders) {
    try {
        console.log('Attempting to download file:', fileKey);

        // Get the file from R2
        const object = await env.FILES_BUCKET.get(fileKey);

        if (!object) {
            console.log('File not found in R2:', fileKey);
            return new Response(JSON.stringify({ error: 'File not found in R2 storage', fileKey }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Get metadata
        const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
        const originalName = object.customMetadata?.originalName || fileKey;

        // Return the file
        return new Response(object.body, {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${originalName}"`,
            },
        });
    } catch (error) {
        console.error('Download error:', error);
        return new Response('Download failed', {
            status: 500,
            headers: corsHeaders
        });
    }
}

// Get sync status
async function handleSyncStatus(env, corsHeaders) {
    try {
        // Count records in database
        const inquiriesCount = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM inquiries"
        ).first();

        const ordersCount = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM orders"
        ).first();

        const filesCount = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM files"
        ).first();

        return new Response(
            JSON.stringify({
                connected: true,
                database: 'D1',
                storage: 'R2',
                stats: {
                    inquiries: inquiriesCount.count,
                    orders: ordersCount.count,
                    files: filesCount.count,
                },
                lastSync: new Date().toISOString(),
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({
                connected: false,
                error: error.message,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
}

// Get storage and usage stats
async function handleGetStats(env, corsHeaders) {
    try {
        // Simulate storage usage - in real implementation would query R2 usage
        const storageUsed = Math.floor(Math.random() * 100 * 1024 * 1024); // Random bytes under 100MB

        return new Response(
            JSON.stringify({
                storageUsed: storageUsed,
                storageLimit: 10 * 1024 * 1024 * 1024, // 10GB
                lastUpdate: new Date().toISOString(),
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: error.message,
                storageUsed: 0,
                storageLimit: 10 * 1024 * 1024 * 1024,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
}

// Delete inquiry
async function handleDeleteInquiry(id, env, corsHeaders) {
    try {
        // First check if inquiry exists
        const inquiry = await env.DB.prepare(
            "SELECT * FROM inquiries WHERE id = ?"
        ).bind(id).first();

        if (!inquiry) {
            return new Response('Inquiry not found', { status: 404, headers: corsHeaders });
        }

        // Get associated files to delete from R2
        const { results: files } = await env.DB.prepare(
            "SELECT * FROM files WHERE inquiry_id = ?"
        ).bind(id).all();

        // Delete files from R2 storage
        let deletedFilesCount = 0;
        for (const file of files) {
            if (file.file_key) {
                try {
                    await env.FILES_BUCKET.delete(file.file_key);
                    console.log(`Deleted R2 file: ${file.file_key}`);
                    deletedFilesCount++;
                } catch (fileError) {
                    console.error(`Failed to delete R2 file ${file.file_key}:`, fileError);
                }
            }
        }

        // Delete associated file records from database
        await env.DB.prepare(
            "DELETE FROM files WHERE inquiry_id = ?"
        ).bind(id).run();

        // Delete the inquiry
        await env.DB.prepare(
            "DELETE FROM inquiries WHERE id = ?"
        ).bind(id).run();

        console.log(`Deleted inquiry ${id} with ${deletedFilesCount} R2 files`);

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Inquiry deleted successfully',
                deletedFiles: deletedFilesCount
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error) {
        console.error('Delete inquiry error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
}
// ==================== AUTHENTICATION HANDLERS ====================

// Handle login
async function handleLogin(request, env, corsHeaders) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return new Response(
                JSON.stringify({ error: 'Username and password are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Find user by username or email
        const user = await env.DB.prepare(
            "SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1"
        ).bind(username, username).first();

        if (!user) {
            return new Response(
                JSON.stringify({ error: 'Invalid credentials' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Verify password
        const isValid = await verifyPassword(password, user.password_hash);
        if (!isValid) {
            return new Response(
                JSON.stringify({ error: 'Invalid credentials' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create session (expires in 7 days)
        const sessionToken = generateSessionToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(
            "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
        ).bind(sessionToken, user.id, expiresAt).run();

        // Update last login
        await env.DB.prepare(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(user.id).run();

        // Log activity
        await logActivity(env, user.id, 'login', 'user', user.id);

        return new Response(
            JSON.stringify({
                success: true,
                token: sessionToken,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    displayName: user.display_name || user.username
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Login error:', error);
        return new Response(
            JSON.stringify({ error: 'Login failed' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
}

// Handle logout
async function handleLogout(request, env, corsHeaders) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
    }

    return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
}

// Get current user
async function handleGetCurrentUser(request, env, corsHeaders) {
    const user = await getUserFromSession(request, env);

    if (!user) {
        return new Response(
            JSON.stringify({ error: 'Not authenticated' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
        JSON.stringify({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                displayName: user.display_name || user.username
            }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
}

// Initial setup - create first admin user
async function handleInitialSetup(request, env, corsHeaders) {
    try {
        // Check if any users exist
        const existingUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();

        if (existingUsers.count > 0) {
            return new Response(
                JSON.stringify({ error: 'Setup already completed. Users exist.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { username, email, password, displayName } = await request.json();

        if (!username || !email || !password) {
            return new Response(
                JSON.stringify({ error: 'Username, email, and password are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const userId = `user-${Date.now()}`;
        const passwordHash = await hashPassword(password);

        await env.DB.prepare(
            `INSERT INTO users (id, username, email, password_hash, role, display_name, is_active)
             VALUES (?, ?, ?, ?, 'admin', ?, 1)`
        ).bind(userId, username, email, passwordHash, displayName || username).run();

        // Auto-login after setup
        const sessionToken = generateSessionToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(
            "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
        ).bind(sessionToken, userId, expiresAt).run();

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Admin account created successfully',
                token: sessionToken,
                user: {
                    id: userId,
                    username,
                    email,
                    role: 'admin',
                    displayName: displayName || username
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Setup error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
}

// Get all users (admin only)
async function handleGetUsers(request, env, corsHeaders) {
    const currentUser = await getUserFromSession(request, env);

    if (!currentUser || currentUser.role !== 'admin') {
        return new Response(
            JSON.stringify({ error: 'Admin access required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    const { results } = await env.DB.prepare(
        "SELECT id, username, email, role, display_name, is_active, created_at, last_login FROM users ORDER BY created_at DESC"
    ).all();

    return new Response(
        JSON.stringify({ users: results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
}

// Create user (admin only)
async function handleCreateUser(request, env, corsHeaders) {
    const currentUser = await getUserFromSession(request, env);

    if (!currentUser || currentUser.role !== 'admin') {
        return new Response(
            JSON.stringify({ error: 'Admin access required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    const { username, email, password, role, displayName } = await request.json();

    if (!username || !email || !password) {
        return new Response(
            JSON.stringify({ error: 'Username, email, and password are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Check for duplicate username or email
    const existing = await env.DB.prepare(
        "SELECT id FROM users WHERE username = ? OR email = ?"
    ).bind(username, email).first();

    if (existing) {
        return new Response(
            JSON.stringify({ error: 'Username or email already exists' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    const userId = `user-${Date.now()}`;
    const passwordHash = await hashPassword(password);

    await env.DB.prepare(
        `INSERT INTO users (id, username, email, password_hash, role, display_name, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).bind(userId, username, email, passwordHash, role || 'staff', displayName || username).run();

    // Log activity
    await logActivity(env, currentUser.id, 'create_user', 'user', userId, username);

    return new Response(
        JSON.stringify({
            success: true,
            user: { id: userId, username, email, role: role || 'staff', displayName: displayName || username }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
}

// Update user (admin only)
async function handleUpdateUser(userId, request, env, corsHeaders) {
    const currentUser = await getUserFromSession(request, env);

    if (!currentUser || currentUser.role !== 'admin') {
        return new Response(
            JSON.stringify({ error: 'Admin access required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    const data = await request.json();

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (data.displayName !== undefined) {
        updates.push('display_name = ?');
        values.push(data.displayName);
    }
    if (data.role !== undefined) {
        updates.push('role = ?');
        values.push(data.role);
    }
    if (data.isActive !== undefined) {
        updates.push('is_active = ?');
        values.push(data.isActive ? 1 : 0);
    }
    if (data.password) {
        updates.push('password_hash = ?');
        values.push(await hashPassword(data.password));
    }

    if (updates.length === 0) {
        return new Response(
            JSON.stringify({ error: 'No fields to update' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    values.push(userId);

    await env.DB.prepare(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    // Log activity
    await logActivity(env, currentUser.id, 'update_user', 'user', userId);

    return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
}

// Delete user (admin only)
async function handleDeleteUser(userId, request, env, corsHeaders) {
    const currentUser = await getUserFromSession(request, env);

    if (!currentUser || currentUser.role !== 'admin') {
        return new Response(
            JSON.stringify({ error: 'Admin access required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Prevent deleting yourself
    if (userId === currentUser.id) {
        return new Response(
            JSON.stringify({ error: 'Cannot delete your own account' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Delete user sessions first
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();

    // Delete user
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

    // Log activity
    await logActivity(env, currentUser.id, 'delete_user', 'user', userId);

    return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
}

// Get activity log (admin only)
async function handleGetActivity(request, env, corsHeaders) {
    const currentUser = await getUserFromSession(request, env);

    if (!currentUser || currentUser.role !== 'admin') {
        return new Response(
            JSON.stringify({ error: 'Admin access required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const entityType = url.searchParams.get('entityType');

    let query = `
        SELECT a.*, u.username, u.display_name
        FROM activity_log a
        LEFT JOIN users u ON a.user_id = u.id
    `;

    if (entityType) {
        query += ` WHERE a.entity_type = ?`;
    }

    query += ` ORDER BY a.created_at DESC LIMIT ?`;

    const stmt = entityType
        ? env.DB.prepare(query).bind(entityType, limit)
        : env.DB.prepare(query).bind(limit);

    const { results } = await stmt.all();

    return new Response(
        JSON.stringify({ activity: results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
}

// ==================== END AUTHENTICATION HANDLERS ====================

// Force cleanup - completely wipe all data
async function handleForceCleanup(env, corsHeaders) {
    try {
        console.log('Starting force cleanup of all Cloudflare data...');

        let deletedCounts = {
            inquiries: 0,
            orders: 0,
            files: 0,
            inventory: 0,
            printers: 0,
            r2Objects: 0
        };

        // 1. Get all records from all tables first to ensure we capture everything
        const inquiriesResult = await env.DB.prepare("SELECT id FROM inquiries").all();
        const ordersResult = await env.DB.prepare("SELECT id FROM orders").all();
        const filesResult = await env.DB.prepare("SELECT id, file_key FROM files").all();
        const inventoryResult = await env.DB.prepare("SELECT id FROM inventory").all();
        const printersResult = await env.DB.prepare("SELECT id FROM printers").all();

        console.log('Found records:', {
            inquiries: inquiriesResult.results.length,
            orders: ordersResult.results.length,
            files: filesResult.results.length,
            inventory: inventoryResult.results.length,
            printers: printersResult.results.length
        });

        // 2. Delete all R2 objects from files table
        for (const file of filesResult.results) {
            if (file.file_key) {
                try {
                    await env.FILES_BUCKET.delete(file.file_key);
                    console.log('Deleted R2 object:', file.file_key);
                    deletedCounts.r2Objects++;
                } catch (e) {
                    console.error('Error deleting R2 object:', file.file_key, e);
                }
            }
        }

        // 3. Also list and delete ALL objects directly from R2 (in case of orphans)
        try {
            const listed = await env.FILES_BUCKET.list({ limit: 1000 });
            for (const object of listed.objects) {
                try {
                    await env.FILES_BUCKET.delete(object.key);
                    console.log('Deleted orphaned R2 object:', object.key);
                    deletedCounts.r2Objects++;
                } catch (e) {
                    console.error('Error deleting orphaned R2 object:', object.key, e);
                }
            }
        } catch (e) {
            console.error('Error listing R2 objects:', e);
        }

        // 4. Force delete ALL records from database tables using DELETE without WHERE
        try {
            const result1 = await env.DB.prepare("DELETE FROM files").run();
            deletedCounts.files = result1.meta.changes || 0;
            console.log('Deleted from files table:', deletedCounts.files);
        } catch (e) {
            console.error('Error deleting from files:', e);
        }

        try {
            const result2 = await env.DB.prepare("DELETE FROM inquiries").run();
            deletedCounts.inquiries = result2.meta.changes || 0;
            console.log('Deleted from inquiries table:', deletedCounts.inquiries);
        } catch (e) {
            console.error('Error deleting from inquiries:', e);
        }

        try {
            const result3 = await env.DB.prepare("DELETE FROM orders").run();
            deletedCounts.orders = result3.meta.changes || 0;
            console.log('Deleted from orders table:', deletedCounts.orders);
        } catch (e) {
            console.error('Error deleting from orders:', e);
        }

        try {
            const result4 = await env.DB.prepare("DELETE FROM inventory").run();
            deletedCounts.inventory = result4.meta.changes || 0;
            console.log('Deleted from inventory table:', deletedCounts.inventory);
        } catch (e) {
            console.error('Error deleting from inventory:', e);
        }

        try {
            const result5 = await env.DB.prepare("DELETE FROM printers").run();
            deletedCounts.printers = result5.meta.changes || 0;
            console.log('Deleted from printers table:', deletedCounts.printers);
        } catch (e) {
            console.error('Error deleting from printers:', e);
        }

        // 5. Verify cleanup by counting remaining records
        const verifyInquiries = await env.DB.prepare("SELECT COUNT(*) as count FROM inquiries").first();
        const verifyOrders = await env.DB.prepare("SELECT COUNT(*) as count FROM orders").first();
        const verifyFiles = await env.DB.prepare("SELECT COUNT(*) as count FROM files").first();

        console.log('Verification after cleanup:', {
            inquiries: verifyInquiries.count,
            orders: verifyOrders.count,
            files: verifyFiles.count
        });

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Force cleanup completed',
                deleted: deletedCounts,
                remaining: {
                    inquiries: verifyInquiries.count,
                    orders: verifyOrders.count,
                    files: verifyFiles.count
                }
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    } catch (error) {
        console.error('Force cleanup error:', error);
        return new Response(
            JSON.stringify({
                error: error.message,
                stack: error.stack
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
}
