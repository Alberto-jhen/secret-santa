import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../supabase/functions/_shared/http.ts'
import {
  assertResendConfigured,
  createResendContext,
  sendGuestResultEmail,
} from '../supabase/functions/_shared/resend.ts'

type Environment = Record<string, string | undefined>

async function withRuntime<T>(
  environment: Environment,
  fetchImplementation: typeof fetch,
  operation: () => Promise<T>,
): Promise<T> {
  const originalDeno = Reflect.get(globalThis, 'Deno')
  const originalFetch = globalThis.fetch

  Reflect.set(globalThis, 'Deno', {
    env: {
      get: (name: string) => environment[name],
    },
  })
  globalThis.fetch = fetchImplementation

  try {
    return await operation()
  } finally {
    globalThis.fetch = originalFetch
    if (originalDeno === undefined) {
      Reflect.deleteProperty(globalThis, 'Deno')
    } else {
      Reflect.set(globalThis, 'Deno', originalDeno)
    }
  }
}

const configuredEnvironment: Environment = {
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'no-reply@example.com',
  RESEND_FROM_NAME: 'Remigo',
  APP_BASE_URL: 'http://localhost:5173',
}

test('sends guest result email through Resend with a server-side API key', async () => {
  let requestUrl = ''
  let requestInit: RequestInit | undefined
  const mockFetch: typeof fetch = async (input, init) => {
    requestUrl = String(input)
    requestInit = init
    return new Response(JSON.stringify({ id: 'email-id' }), { status: 200 })
  }

  await withRuntime(configuredEnvironment, mockFetch, async () => {
    await sendGuestResultEmail(createResendContext(), {
      email: 'ana@example.com',
      participantName: 'Ana',
      assignedName: 'Carlos',
      resultUrl: 'http://localhost:5173/guest-result#token=abc',
      locale: 'es',
    })
  })

  assert.equal(requestUrl, 'https://api.resend.com/emails')
  assert.equal(
    new Headers(requestInit?.headers).get('Authorization'),
    'Bearer re_test_key',
  )
  assert.equal(new Headers(requestInit?.headers).get('Content-Type'), 'application/json')
  const body = JSON.parse(String(requestInit?.body)) as {
    from: string
    to: string[]
    subject: string
    text: string
  }
  assert.equal(body.from, 'Remigo <no-reply@example.com>')
  assert.deepEqual(body.to, ['ana@example.com'])
  assert.equal(body.subject, 'Tu resultado del Amigo Invisible')
  assert.match(body.text, /Te ha tocado: Carlos/)
  assert.match(body.text, /guest-result#token=abc/)
})

test('requires a Resend API key before sending', async () => {
  const mockFetch: typeof fetch = async () => {
    throw new Error('Fetch should not be called')
  }

  await withRuntime(
    {
      RESEND_FROM_EMAIL: 'no-reply@example.com',
      APP_BASE_URL: 'http://localhost:5173',
    },
    mockFetch,
    async () => {
      assert.throws(
        () => assertResendConfigured(),
        (error: unknown) =>
          error instanceof HttpError && error.code === 'service_not_configured',
      )
    },
  )
})

test('rejects an invalid Resend sender address', async () => {
  const mockFetch: typeof fetch = async () => {
    throw new Error('Fetch should not be called')
  }

  await withRuntime(
    {
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM_EMAIL: 'not-an-email',
      APP_BASE_URL: 'http://localhost:5173',
    },
    mockFetch,
    async () => {
      assert.throws(
        () => assertResendConfigured(),
        (error: unknown) =>
          error instanceof HttpError && error.code === 'service_not_configured',
      )
    },
  )
})
test('maps Resend API failures to a safe delivery error', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ message: 'invalid API key' }), { status: 401 })

  await withRuntime(configuredEnvironment, mockFetch, async () => {
    await assert.rejects(
      sendGuestResultEmail(createResendContext(), {
        email: 'ana@example.com',
        participantName: 'Ana',
        assignedName: 'Carlos',
        resultUrl: 'http://localhost:5173/guest-result#token=abc',
        locale: 'en',
      }),
      (error: unknown) =>
        error instanceof HttpError && error.code === 'email_delivery_failed',
    )
  })
})
