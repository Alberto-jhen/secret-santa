export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

interface HandlerResult {
  payload: unknown
  status?: number
}

type PostHandler = (request: Request) => Promise<HandlerResult>

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get('ALLOWED_ORIGINS') ?? ''

  return new Set(
    configured
      .split(',')
      .map((origin) => {
        try {
          return new URL(origin.trim()).origin
        } catch {
          return ''
        }
      })
      .filter(Boolean),
  )
}

function corsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get('origin')

  if (!origin || !allowedOrigins().has(origin)) {
    return null
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

function jsonResponse(
  payload: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function servePost(handler: PostHandler): void {
  Deno.serve(async (request) => {
    const cors = corsHeaders(request)

    if (!cors) {
      return jsonResponse({ error: 'origin_not_allowed' }, 403)
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405, cors)
    }

    try {
      const result = await handler(request)
      return jsonResponse(result.payload, result.status ?? 200, cors)
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.code }, error.status, cors)
      }

      console.error('Guest draw request failed')
      return jsonResponse({ error: 'internal_error' }, 500, cors)
    }
  })
}

async function constantTimeEquals(first: string, second: string): Promise<boolean> {
  const [firstDigest, secondDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(first)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(second)),
  ])
  const firstBytes = new Uint8Array(firstDigest)
  const secondBytes = new Uint8Array(secondDigest)
  let difference = 0

  for (let index = 0; index < firstBytes.length; index += 1) {
    difference |= firstBytes[index] ^ secondBytes[index]
  }

  return difference === 0
}

export function serveProtectedPost(
  secretHeader: string,
  secretName: string,
  handler: PostHandler,
): void {
  Deno.serve(async (request) => {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405)
    }

    try {
      const expectedSecret = requiredEnv(secretName, 32)
      const suppliedSecret = request.headers.get(secretHeader) ?? ''

      if (!(await constantTimeEquals(expectedSecret, suppliedSecret))) {
        return jsonResponse({ error: 'unauthorized' }, 401)
      }

      const result = await handler(request)
      return jsonResponse(result.payload, result.status ?? 200)
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.code }, error.status)
      }

      console.error('Protected scheduled function failed')
      return jsonResponse({ error: 'internal_error' }, 500)
    }
  })
}
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    throw new HttpError(400, 'invalid_json')
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'invalid_request')
  }

  return body as Record<string, unknown>
}

export function requiredEnv(name: string, minimumLength = 1): string {
  const value = Deno.env.get(name)?.trim()

  if (!value || value.length < minimumLength) {
    throw new HttpError(503, 'service_not_configured')
  }

  return value
}

export function clientIp(request: Request): string {
  const forwardedFor = request.headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const ip =
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    forwardedFor?.at(-1)

  if (!ip || ip.length > 64) {
    throw new HttpError(503, 'rate_limit_unavailable')
  }

  return ip
}
