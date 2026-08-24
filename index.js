import postgres from 'postgres';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const sql = postgres(env.HYPERDRIVE.connectionString, { max: 1 });

    try {
      // --- AUTH LOGIN ---
      if (path === '/api/admin/auth/login' && method === 'POST') {
        const { username } = await request.json();
        const users = await sql`SELECT * FROM users WHERE username = ${username}`;
        if (users.length === 0) {
          return Response.json({ ok: false, error: 'User not found' }, { status: 401, headers: corsHeaders });
        }
        const user = users[0];
        return Response.json({ ok: true, token: 'demo-token-' + user.id, user }, { headers: corsHeaders });
      }

      // --- AUTH ME ---
      if (path === '/api/admin/auth/me' && method === 'GET') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
          return Response.json({ ok: false, error: 'No token' }, { status: 401, headers: corsHeaders });
        }
        const token = authHeader.replace('Bearer ', '');
        const userId = token.replace('demo-token-', '');
        const users = await sql`SELECT * FROM users WHERE id = ${userId}`;
        if (users.length === 0) {
          return Response.json({ ok: false, error: 'User not found' }, { status: 401, headers: corsHeaders });
        }
        return Response.json({ ok: true, user: users[0] }, { headers: corsHeaders });
      }

      // --- GET STATS ---
      if (path === '/api/admin/stats' && method === 'GET') {
        const totalKeys = await sql`SELECT COUNT(*) FROM keys`;
        const activeKeys = await sql`SELECT COUNT(*) FROM keys WHERE status = 'active'`;
        const totalMods = await sql`SELECT COUNT(*) FROM mods`;
        return Response.json({ ok: true, data: { totals: { total: totalKeys[0].count, active: activeKeys[0].count, apps: totalMods[0].count } } }, { headers: corsHeaders });
      }

      // --- GET MODS ---
      if (path === '/api/admin/mods' && method === 'GET') {
        const mods = await sql`SELECT * FROM mods ORDER BY sort_order ASC`;
        return Response.json({ ok: true, data: mods }, { headers: corsHeaders });
      }

      // --- GET PACKAGES ---
      if (path === '/api/admin/packages' && method === 'GET') {
        const modId = url.searchParams.get('modId');
        if (modId) {
          const packages = await sql`SELECT * FROM packages WHERE mod_id = ${modId} ORDER BY created_at ASC`;
          return Response.json({ ok: true, data: packages }, { headers: corsHeaders });
        } else {
          const packages = await sql`SELECT * FROM packages ORDER BY created_at ASC`;
          return Response.json({ ok: true, data: packages }, { headers: corsHeaders });
        }
      }

      // --- GET KEYS (List with Pagination) ---
      if (path === '/api/admin/keys' && method === 'GET') {
        const page = parseInt(url.searchParams.get('page') || '1');
        const pageSize = parseInt(url.searchParams.get('pageSize') || '24');
        const offset = (page - 1) * pageSize;
        const keys = await sql`SELECT * FROM keys ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
        const totalResult = await sql`SELECT COUNT(*) FROM keys`;
        return Response.json({ ok: true, data: keys, pagination: { total: totalResult[0].count, totalPages: Math.ceil(totalResult[0].count / pageSize), page } }, { headers: corsHeaders });
      }

      // --- CREATE NEW KEY ---
      if (path === '/api/admin/keys' && method === 'POST') {
        const body = await request.json();
        const keyString = 'K' + Math.random().toString(36).substring(2, 10).toUpperCase();
        const result = await sql`
          INSERT INTO keys (id, key_string, mod_id, package_id, key_type, status, access_limit, seller_id)
          VALUES (${Date.now().toString()}, ${keyString}, ${body.modId || null}, ${body.packageId || null}, ${body.keyType || 'regular'}, 'active', ${body.access || 1}, ${body.sellerId || null})
          RETURNING *
        `;
        return Response.json({ ok: true, data: result[0] }, { headers: corsHeaders });
      }

      // --- GET SINGLE KEY DETAILS ---
      if (path.match(/^\/api\/admin\/keys\/[^/]+$/) && method === 'GET') {
        const keyId = path.split('/').pop();
        const result = await sql`SELECT * FROM keys WHERE id = ${keyId}`;
        if (result.length === 0) {
          return Response.json({ ok: false, error: 'Key not found' }, { status: 404, headers: corsHeaders });
        }
        return Response.json({ ok: true, data: result[0] }, { headers: corsHeaders });
      }

      // --- GET RESELLERS ---
      if (path === '/api/admin/resellers' && method === 'GET') {
        const resellers = await sql`SELECT * FROM users WHERE role = 'reseller' OR role = 'superadmin'`;
        return Response.json({ ok: true, data: resellers }, { headers: corsHeaders });
      }

      // --- GET WALLETS ---
      if (path === '/api/admin/wallets' && method === 'GET') {
        const wallets = await sql`SELECT * FROM users`;
        return Response.json({ ok: true, data: wallets }, { headers: corsHeaders });
      }

      // --- 404 ---
      return Response.json({ ok: false, error: 'Not found' }, { status: 404, headers: corsHeaders });

    } catch (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500, headers: corsHeaders });
    } finally {
      await sql.end();
    }
  }
};
