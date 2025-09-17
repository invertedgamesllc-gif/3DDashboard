// Cloudflare Worker API for 3D Print Business
// Handles all database operations and file storage

export default {
    async fetch(request, env, ctx) {
        // Enable CORS
        const corsHeaders = {
            'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
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

            if (path === '/api/orders' && request.method === 'GET') {
                return await handleGetOrders(env, corsHeaders);
            }

            if (path === '/api/orders' && request.method === 'POST') {
                return await handleCreateOrder(request, env, corsHeaders);
            }

            if (path === '/api/upload' && request.method === 'POST') {
                return await handleFileUpload(request, env, corsHeaders);
            }

            if (path.startsWith('/api/download/') && request.method === 'GET') {
                const fileKey = path.replace('/api/download/', '');
                return await handleFileDownload(fileKey, env, corsHeaders);
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
        "SELECT * FROM inquiries ORDER BY created_at DESC"
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

    // Parse total quote to number
    let totalQuoteNum = 0;
    if (data.totalQuote) {
        const quoteStr = data.totalQuote.toString().replace(/[$,]/g, '');
        totalQuoteNum = parseFloat(quoteStr) || 0;
    }

    await env.DB.prepare(
        `INSERT INTO inquiries (
            id, customer_name, customer_email, project_description,
            material_weight, print_time, material_type, total_quote, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        id,
        data.customerName || 'Unknown',
        data.customerEmail || 'no-email@provided.com',
        data.projectDescription || '',
        data.materialWeight || 0,
        data.printTime || 0,
        data.materialType || 'PLA',
        totalQuoteNum,
        data.status || 'pending'
    ).run();

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
    const id = `ORD-${Date.now()}`;

    await env.DB.prepare(
        `INSERT INTO orders (
            id, inquiry_id, customer_name, customer_email,
            total_amount, status, printer_assigned, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        id,
        data.inquiryId || null,
        data.customerName,
        data.customerEmail || '',
        data.totalAmount || 0,
        data.status || 'pending',
        data.printerAssigned || null,
        data.notes || ''
    ).run();

    return new Response(
        JSON.stringify({ success: true, order: { id, ...data } }),
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

// Get inventory
async function handleGetInventory(env, corsHeaders) {
    const { results } = await env.DB.prepare(
        "SELECT * FROM inventory ORDER BY material_type"
    ).all();

    return new Response(JSON.stringify({ inventory: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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

        // Delete associated files first
        await env.DB.prepare(
            "DELETE FROM files WHERE inquiry_id = ?"
        ).bind(id).run();

        // Delete the inquiry
        await env.DB.prepare(
            "DELETE FROM inquiries WHERE id = ?"
        ).bind(id).run();

        return new Response(
            JSON.stringify({ success: true, message: 'Inquiry deleted successfully' }),
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