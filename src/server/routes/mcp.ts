import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Router } from 'express';
import { apiKeyVerifier, oauthVerifier, principal, requireBearer } from '../auth/middleware.js';
import { buildMcpServer } from '../mcp/server.js';
import { oauthUrlOf } from '../config.js';
import type { ServiceCtx } from '../services/context.js';

const methodNotAllowed = {
  jsonrpc: '2.0',
  error: { code: -32000, message: 'Method not allowed: this MCP endpoint is stateless, use POST.' },
  id: null,
};

export function mcpRouter(ctx: ServiceCtx): Router {
  const router = Router();
  const publicUrl = oauthUrlOf(ctx.config.publicUrl);
  // OAuth needs a public URL (issuer + protected resource metadata); without it only API keys work.
  const auth = publicUrl
    ? requireBearer(ctx, ['read'], [apiKeyVerifier, oauthVerifier], {
        resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL('/mcp', publicUrl)),
      })
    : requireBearer(ctx, ['read']);
  router.post('/', auth, async (req, res) => {
    const { userId, scope } = principal(req);
    const server = buildMcpServer({ ...ctx, userId, scope });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('mcp request failed', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });
  router.all('/', (_req, res) => {
    res.status(405).set('Allow', 'POST').json(methodNotAllowed);
  });
  return router;
}
