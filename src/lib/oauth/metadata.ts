// ============================================================================
// OAUTH DISCOVERY DOCUMENTS (RFC 9728 + RFC 8414) for the DLM MCP connector
// ============================================================================

import { getServedUrl as getAppUrl } from '@/lib/app-url'
import { OAUTH_SCOPES } from './oauth'

type Req = { headers?: Headers; nextUrl?: URL; url?: string }

export const mcpResourceUrl = (req: Req) => `${getAppUrl(req)}/api/mcp`
export const protectedResourceMetadataUrl = (req: Req) => `${getAppUrl(req)}/.well-known/oauth-protected-resource/api/mcp`

/** RFC 9728: what the MCP server is and which authorization server protects it. */
export function protectedResourceMetadata(req: Req) {
  const base = getAppUrl(req)
  return {
    resource: mcpResourceUrl(req),
    authorization_servers: [base],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'DLM — Device Lifecycle Management',
    resource_documentation: `${base}/var/assistants`,
  }
}

/** RFC 8414: how to register, authorize and get tokens. */
export function authorizationServerMetadata(req: Req) {
  const base = getAppUrl(req)
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...OAUTH_SCOPES],
  }
}
