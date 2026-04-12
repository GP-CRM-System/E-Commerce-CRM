// http module is provided by the Postman sandbox

const server = http.createServer((req, res) => {
  const { method, url } = req;
  const parsedUrl = new URL(url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Helper to send JSON response
  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // Helper to parse JSON body
  const parseBody = (callback) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        callback(body ? JSON.parse(body) : {});
      } catch (e) {
        callback({});
      }
    });
  };

  // Extract path parameters
  const matchPath = (pattern) => {
    const patternParts = pattern.split('/');
    const pathParts = pathname.split('/');
    if (patternParts.length !== pathParts.length) return null;
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }
    return params;
  };

  // ==================== AUTH ROUTES ====================

  // @endpoint POST /api/auth/sign-up/email
  if (method === 'POST' && pathname === '/api/auth/sign-up/email') {
    parseBody((body) => {
      sendJson(201, {
        user: {
          id: 'usr_mock_001',
          email: body.email || 'user@example.com',
          name: body.name || 'Mock User',
          emailVerified: false,
          createdAt: new Date().toISOString()
        },
        session: {
          id: 'sess_mock_001',
          token: 'mock-session-token-abc123',
          expiresAt: new Date(Date.now() + 86400000).toISOString()
        }
      });
    });
    return;
  }

  // @endpoint POST /api/auth/sign-in/email
  if (method === 'POST' && pathname === '/api/auth/sign-in/email') {
    parseBody((body) => {
      sendJson(200, {
        user: {
          id: 'usr_mock_001',
          email: body.email || 'user@example.com',
          name: 'Mock User',
          emailVerified: true,
          createdAt: '2024-01-01T00:00:00.000Z'
        },
        session: {
          id: 'sess_mock_002',
          token: 'mock-session-token-xyz789',
          expiresAt: new Date(Date.now() + 86400000).toISOString()
        }
      });
    });
    return;
  }

  // @endpoint POST /api/auth/sign-out
  if (method === 'POST' && pathname === '/api/auth/sign-out') {
    sendJson(200, { success: true, message: 'Signed out successfully' });
    return;
  }

  // @endpoint GET /api/auth/me
  if (method === 'GET' && pathname === '/api/auth/me') {
    sendJson(200, {
      user: {
        id: 'usr_mock_001',
        email: 'user@example.com',
        name: 'Mock User',
        emailVerified: true,
        createdAt: '2024-01-01T00:00:00.000Z'
      },
      session: {
        id: 'sess_mock_001',
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      }
    });
    return;
  }

  // @endpoint GET /api/auth/get-session
  if (method === 'GET' && pathname === '/api/auth/get-session') {
    sendJson(200, {
      session: {
        id: 'sess_mock_001',
        userId: 'usr_mock_001',
        token: 'mock-session-token-xyz789',
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      },
      user: {
        id: 'usr_mock_001',
        email: 'user@example.com',
        name: 'Mock User'
      }
    });
    return;
  }

  // @endpoint POST /api/auth/forgot-password
  if (method === 'POST' && pathname === '/api/auth/forgot-password') {
    parseBody((body) => {
      sendJson(200, { success: true, message: 'Password reset email sent' });
    });
    return;
  }

  // @endpoint POST /api/auth/reset-password
  if (method === 'POST' && pathname === '/api/auth/reset-password') {
    parseBody((body) => {
      sendJson(200, { success: true, message: 'Password reset successfully' });
    });
    return;
  }

  // @endpoint POST /api/auth/send-verification-email
  if (method === 'POST' && pathname === '/api/auth/send-verification-email') {
    sendJson(200, { success: true, message: 'Verification email sent' });
    return;
  }

  // ==================== CUSTOMER ROUTES ====================

  // @endpoint GET /api/customers
  if (method === 'GET' && pathname === '/api/customers') {
    sendJson(200, {
      data: [
        {
          id: 'cust_001',
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
          totalOrders: 5,
          totalSpent: 499.99,
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-03-01T14:20:00.000Z'
        },
        {
          id: 'cust_002',
          email: 'jane.smith@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+0987654321',
          totalOrders: 12,
          totalSpent: 1299.50,
          createdAt: '2024-02-01T08:00:00.000Z',
          updatedAt: '2024-03-10T16:45:00.000Z'
        }
      ],
      pagination: {
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1
      }
    });
    return;
  }

  // @endpoint POST /api/customers
  if (method === 'POST' && pathname === '/api/customers') {
    parseBody((body) => {
      sendJson(201, {
        id: 'cust_' + Date.now(),
        email: body.email || 'new.customer@example.com',
        firstName: body.firstName || 'New',
        lastName: body.lastName || 'Customer',
        phone: body.phone || null,
        totalOrders: 0,
        totalSpent: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint GET /api/customers/:id
  let params = matchPath('/api/customers/:id');
  if (method === 'GET' && params && !pathname.includes('/notes') && !pathname.includes('/events')) {
    sendJson(200, {
      id: params.id,
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      totalOrders: 5,
      totalSpent: 499.99,
      tags: ['vip', 'returning'],
      createdAt: '2024-01-15T10:30:00.000Z',
      updatedAt: '2024-03-01T14:20:00.000Z'
    });
    return;
  }

  // @endpoint PUT /api/customers/:id
  params = matchPath('/api/customers/:id');
  if (method === 'PUT' && params && !pathname.includes('/notes') && !pathname.includes('/events')) {
    parseBody((body) => {
      sendJson(200, {
        id: params.id,
        email: body.email || 'john.doe@example.com',
        firstName: body.firstName || 'John',
        lastName: body.lastName || 'Doe',
        phone: body.phone || '+1234567890',
        updatedAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint DELETE /api/customers/:id
  params = matchPath('/api/customers/:id');
  if (method === 'DELETE' && params && !pathname.includes('/notes') && !pathname.includes('/events')) {
    sendJson(200, { success: true, message: 'Customer deleted successfully' });
    return;
  }

  // @endpoint GET /api/customers/:id/notes
  params = matchPath('/api/customers/:id/notes');
  if (method === 'GET' && params) {
    sendJson(200, {
      data: [
        {
          id: 'note_001',
          customerId: params.id,
          content: 'Customer prefers email communication',
          createdBy: 'usr_mock_001',
          createdAt: '2024-02-15T10:00:00.000Z'
        },
        {
          id: 'note_002',
          customerId: params.id,
          content: 'VIP customer - priority support',
          createdBy: 'usr_mock_001',
          createdAt: '2024-03-01T14:30:00.000Z'
        }
      ]
    });
    return;
  }

  // @endpoint POST /api/customers/:id/notes
  params = matchPath('/api/customers/:id/notes');
  if (method === 'POST' && params) {
    parseBody((body) => {
      sendJson(201, {
        id: 'note_' + Date.now(),
        customerId: params.id,
        content: body.content || 'New note',
        createdBy: 'usr_mock_001',
        createdAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint PUT /api/customers/:id/notes/:noteId
  params = matchPath('/api/customers/:id/notes/:noteId');
  if (method === 'PUT' && params) {
    parseBody((body) => {
      sendJson(200, {
        id: params.noteId,
        customerId: params.id,
        content: body.content || 'Updated note',
        updatedAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint DELETE /api/customers/:id/notes/:noteId
  params = matchPath('/api/customers/:id/notes/:noteId');
  if (method === 'DELETE' && params) {
    sendJson(200, { success: true, message: 'Note deleted successfully' });
    return;
  }

  // @endpoint GET /api/customers/:id/events
  params = matchPath('/api/customers/:id/events');
  if (method === 'GET' && params) {
    sendJson(200, {
      data: [
        {
          id: 'evt_001',
          customerId: params.id,
          type: 'order_placed',
          description: 'Customer placed order #12345',
          metadata: { orderId: 'ord_12345', amount: 99.99 },
          createdAt: '2024-03-01T10:00:00.000Z'
        },
        {
          id: 'evt_002',
          customerId: params.id,
          type: 'support_ticket',
          description: 'Customer opened support ticket',
          metadata: { ticketId: 'tkt_001' },
          createdAt: '2024-03-05T14:30:00.000Z'
        }
      ]
    });
    return;
  }

  // @endpoint POST /api/customers/:id/events
  params = matchPath('/api/customers/:id/events');
  if (method === 'POST' && params) {
    parseBody((body) => {
      sendJson(201, {
        id: 'evt_' + Date.now(),
        customerId: params.id,
        type: body.type || 'custom_event',
        description: body.description || 'New event',
        metadata: body.metadata || {},
        createdAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint PUT /api/customers/:id/events/:eventId
  params = matchPath('/api/customers/:id/events/:eventId');
  if (method === 'PUT' && params) {
    parseBody((body) => {
      sendJson(200, {
        id: params.eventId,
        customerId: params.id,
        type: body.type || 'custom_event',
        description: body.description || 'Updated event',
        updatedAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint DELETE /api/customers/:id/events/:eventId
  params = matchPath('/api/customers/:id/events/:eventId');
  if (method === 'DELETE' && params) {
    sendJson(200, { success: true, message: 'Event deleted successfully' });
    return;
  }

  // ==================== ORGANIZATION ROUTES ====================

  // @endpoint POST /api/auth/organization/create
  if (method === 'POST' && pathname === '/api/auth/organization/create') {
    parseBody((body) => {
      sendJson(201, {
        id: 'org_mock_001',
        name: body.name || 'Mock Organization',
        slug: body.slug || 'mock-org',
        logo: body.logo || null,
        createdAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint GET /api/auth/organization/get-full-organization
  if (method === 'GET' && pathname === '/api/auth/organization/get-full-organization') {
    sendJson(200, {
      id: 'org_mock_001',
      name: 'Mock Organization',
      slug: 'mock-org',
      logo: null,
      members: [
        { id: 'mem_001', userId: 'usr_mock_001', role: 'owner', email: 'owner@example.com' },
        { id: 'mem_002', userId: 'usr_mock_002', role: 'admin', email: 'admin@example.com' }
      ],
      invitations: [],
      createdAt: '2024-01-01T00:00:00.000Z'
    });
    return;
  }

  // @endpoint PATCH /api/auth/organization/update
  if (method === 'PATCH' && pathname === '/api/auth/organization/update') {
    parseBody((body) => {
      sendJson(200, {
        id: 'org_mock_001',
        name: body.name || 'Updated Organization',
        slug: body.slug || 'mock-org',
        logo: body.logo || null,
        updatedAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint DELETE /api/auth/organization/delete
  if (method === 'DELETE' && pathname === '/api/auth/organization/delete') {
    sendJson(200, { success: true, message: 'Organization deleted successfully' });
    return;
  }

  // @endpoint GET /api/auth/organization/check-slug
  if (method === 'GET' && pathname === '/api/auth/organization/check-slug') {
    const slug = parsedUrl.searchParams.get('slug');
    sendJson(200, { slug: slug || 'test-slug', available: true });
    return;
  }

  // ==================== MEMBER ROUTES ====================

  // @endpoint GET /api/auth/organization/list-members
  if (method === 'GET' && pathname === '/api/auth/organization/list-members') {
    sendJson(200, {
      members: [
        { id: 'mem_001', userId: 'usr_mock_001', role: 'owner', email: 'owner@example.com', name: 'Owner User' },
        { id: 'mem_002', userId: 'usr_mock_002', role: 'admin', email: 'admin@example.com', name: 'Admin User' },
        { id: 'mem_003', userId: 'usr_mock_003', role: 'member', email: 'member@example.com', name: 'Member User' }
      ]
    });
    return;
  }

  // @endpoint GET /api/auth/organization/get-active-member
  if (method === 'GET' && pathname === '/api/auth/organization/get-active-member') {
    sendJson(200, {
      id: 'mem_001',
      userId: 'usr_mock_001',
      organizationId: 'org_mock_001',
      role: 'owner',
      email: 'owner@example.com',
      name: 'Owner User',
      joinedAt: '2024-01-01T00:00:00.000Z'
    });
    return;
  }

  // @endpoint POST /api/auth/organization/invite-member
  if (method === 'POST' && pathname === '/api/auth/organization/invite-member') {
    parseBody((body) => {
      sendJson(201, {
        id: 'inv_' + Date.now(),
        email: body.email || 'invitee@example.com',
        role: body.role || 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        createdAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint POST /api/auth/organization/accept-invitation
  if (method === 'POST' && pathname === '/api/auth/organization/accept-invitation') {
    parseBody((body) => {
      sendJson(200, {
        success: true,
        member: {
          id: 'mem_' + Date.now(),
          userId: 'usr_mock_new',
          role: 'member',
          joinedAt: new Date().toISOString()
        }
      });
    });
    return;
  }

  // @endpoint POST /api/auth/organization/cancel-invitation
  if (method === 'POST' && pathname === '/api/auth/organization/cancel-invitation') {
    sendJson(200, { success: true, message: 'Invitation cancelled' });
    return;
  }

  // @endpoint GET /api/auth/organization/get-invitation
  if (method === 'GET' && pathname === '/api/auth/organization/get-invitation') {
    sendJson(200, {
      id: 'inv_mock_001',
      email: 'invitee@example.com',
      role: 'member',
      organizationName: 'Mock Organization',
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString()
    });
    return;
  }

  // @endpoint POST /api/auth/organization/remove-member
  if (method === 'POST' && pathname === '/api/auth/organization/remove-member') {
    sendJson(200, { success: true, message: 'Member removed successfully' });
    return;
  }

  // @endpoint PATCH /api/auth/organization/update-member-role
  if (method === 'PATCH' && pathname === '/api/auth/organization/update-member-role') {
    parseBody((body) => {
      sendJson(200, {
        id: body.memberId || 'mem_001',
        role: body.role || 'admin',
        updatedAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint POST /api/auth/organization/leave
  if (method === 'POST' && pathname === '/api/auth/organization/leave') {
    sendJson(200, { success: true, message: 'Left organization successfully' });
    return;
  }

  // ==================== ROLES ROUTES ====================

  // @endpoint GET /api/auth/roles
  if (method === 'GET' && pathname === '/api/auth/roles') {
    sendJson(200, {
      roles: [
        { id: 'role_owner', name: 'owner', permissions: ['*'] },
        { id: 'role_admin', name: 'admin', permissions: ['customers:*', 'integrations:*', 'members:read', 'members:write'] },
        { id: 'role_member', name: 'member', permissions: ['customers:read', 'customers:write'] }
      ]
    });
    return;
  }

  // @endpoint POST /api/auth/roles
  if (method === 'POST' && pathname === '/api/auth/roles') {
    parseBody((body) => {
      sendJson(201, {
        id: 'role_' + Date.now(),
        name: body.name || 'custom_role',
        permissions: body.permissions || [],
        createdAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint DELETE /api/auth/roles/:roleId
  params = matchPath('/api/auth/roles/:roleId');
  if (method === 'DELETE' && params) {
    sendJson(200, { success: true, message: 'Role deleted successfully' });
    return;
  }

  // ==================== INTEGRATION ROUTES ====================

  // @endpoint GET /api/integrations
  if (method === 'GET' && pathname === '/api/integrations') {
    sendJson(200, {
      data: [
        {
          id: 'int_001',
          provider: 'shopify',
          name: 'My Shopify Store',
          shopDomain: 'mystore.myshopify.com',
          isActive: true,
          syncMode: 'webhook',
          lastSyncAt: '2024-03-15T10:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      ]
    });
    return;
  }

  // @endpoint POST /api/integrations/shopify/connect
  if (method === 'POST' && pathname === '/api/integrations/shopify/connect') {
    parseBody((body) => {
      sendJson(201, {
        id: 'int_' + Date.now(),
        provider: 'shopify',
        name: body.name || 'Shopify Integration',
        shopDomain: body.shopDomain || 'store.myshopify.com',
        isActive: true,
        syncMode: 'webhook',
        createdAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint GET /api/integrations/:integrationId
  params = matchPath('/api/integrations/:integrationId');
  if (method === 'GET' && params && !pathname.includes('/sync') && !pathname.includes('/webhooks') && !pathname.includes('/test-connection')) {
    sendJson(200, {
      id: params.integrationId,
      provider: 'shopify',
      name: 'My Shopify Store',
      shopDomain: 'mystore.myshopify.com',
      isActive: true,
      syncMode: 'webhook',
      lastSyncAt: '2024-03-15T10:00:00.000Z',
      stats: {
        customersImported: 150,
        ordersImported: 500,
        productsImported: 75
      },
      createdAt: '2024-01-01T00:00:00.000Z'
    });
    return;
  }

  // @endpoint PATCH /api/integrations/:integrationId
  params = matchPath('/api/integrations/:integrationId');
  if (method === 'PATCH' && params && !pathname.includes('/sync') && !pathname.includes('/webhooks')) {
    parseBody((body) => {
      sendJson(200, {
        id: params.integrationId,
        name: body.name || 'Updated Integration',
        syncMode: body.syncMode || 'webhook',
        isActive: body.isActive !== undefined ? body.isActive : true,
        updatedAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint DELETE /api/integrations/:integrationId
  params = matchPath('/api/integrations/:integrationId');
  if (method === 'DELETE' && params && !pathname.includes('/sync') && !pathname.includes('/webhooks')) {
    sendJson(200, { success: true, message: 'Integration deleted successfully' });
    return;
  }

  // @endpoint POST /api/integrations/:integrationId/test-connection
  params = matchPath('/api/integrations/:integrationId/test-connection');
  if (method === 'POST' && params) {
    sendJson(200, {
      success: true,
      message: 'Connection successful',
      shopInfo: {
        name: 'My Shopify Store',
        domain: 'mystore.myshopify.com',
        plan: 'Basic Shopify'
      }
    });
    return;
  }

  // @endpoint POST /api/integrations/:integrationId/webhooks/register
  params = matchPath('/api/integrations/:integrationId/webhooks/register');
  if (method === 'POST' && params) {
    parseBody((body) => {
      sendJson(200, {
        success: true,
        registeredWebhooks: (body.topics || ['orders/create', 'customers/create']).map(topic => ({
          id: 'wh_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          topic: topic,
          address: `https://api.example.com/webhooks/shopify/${params.integrationId}`,
          createdAt: new Date().toISOString()
        }))
      });
    });
    return;
  }

  // ==================== SYNC ROUTES ====================

  // @endpoint POST /api/integrations/:integrationId/sync/full
  params = matchPath('/api/integrations/:integrationId/sync/full');
  if (method === 'POST' && params) {
    parseBody((body) => {
      sendJson(200, {
        success: true,
        syncId: 'sync_' + Date.now(),
        integrationId: params.integrationId,
        entities: body.entities || ['customers', 'orders', 'products'],
        status: 'completed',
        results: {
          customers: { imported: 50, updated: 10, failed: 0 },
          orders: { imported: 120, updated: 25, failed: 2 },
          products: { imported: 30, updated: 5, failed: 0 }
        },
        completedAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint GET /api/integrations/:integrationId/sync/logs
  params = matchPath('/api/integrations/:integrationId/sync/logs');
  if (method === 'GET' && params) {
    sendJson(200, {
      data: [
        {
          id: 'synclog_001',
          integrationId: params.integrationId,
          syncType: 'full',
          status: 'completed',
          entitiesSynced: ['customers', 'orders'],
          recordsProcessed: 175,
          errors: 0,
          startedAt: '2024-03-15T10:00:00.000Z',
          completedAt: '2024-03-15T10:05:30.000Z'
        },
        {
          id: 'synclog_002',
          integrationId: params.integrationId,
          syncType: 'incremental',
          status: 'completed',
          entitiesSynced: ['orders'],
          recordsProcessed: 12,
          errors: 0,
          startedAt: '2024-03-16T08:00:00.000Z',
          completedAt: '2024-03-16T08:00:45.000Z'
        }
      ],
      pagination: { page: 1, limit: 10, total: 2 }
    });
    return;
  }

  // ==================== WEBHOOK ROUTES ====================

  // @endpoint POST /api/webhooks/shopify/:integrationId
  params = matchPath('/api/webhooks/shopify/:integrationId');
  if (method === 'POST' && params) {
    parseBody((body) => {
      sendJson(200, {
        success: true,
        message: 'Webhook received and processed',
        integrationId: params.integrationId,
        processedAt: new Date().toISOString()
      });
    });
    return;
  }

  // @endpoint GET /api/webhooks/:integrationId/logs
  params = matchPath('/api/webhooks/:integrationId/logs');
  if (method === 'GET' && params) {
    sendJson(200, {
      data: [
        {
          id: 'whlog_001',
          integrationId: params.integrationId,
          topic: 'orders/create',
          status: 'processed',
          payload: { orderId: 'shopify_ord_123' },
          receivedAt: '2024-03-15T14:30:00.000Z',
          processedAt: '2024-03-15T14:30:02.000Z'
        },
        {
          id: 'whlog_002',
          integrationId: params.integrationId,
          topic: 'customers/update',
          status: 'processed',
          payload: { customerId: 'shopify_cust_456' },
          receivedAt: '2024-03-15T15:00:00.000Z',
          processedAt: '2024-03-15T15:00:01.000Z'
        }
      ],
      pagination: { page: 1, limit: 10, total: 2 }
    });
    return;
  }

  // ==================== 404 FALLBACK ====================
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not Found',
    message: 'Mock route not defined',
    method: method,
    path: pathname
  }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('E-Commerce CRM API Mock server running on port ' + PORT));
