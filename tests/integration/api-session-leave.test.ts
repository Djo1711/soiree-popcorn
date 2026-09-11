import { describe, expect, it } from 'vitest'

describe('POST /api/session/leave', () => {
  it('répond 200 et expire le cookie sp_session', async () => {
    const { POST } = await import('@/app/api/session/leave/route')
    const r = await POST()
    expect(r.status).toBe(200)
    const cookie = r.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/sp_session=;/)
    expect(cookie).toMatch(/Max-Age=0/)
  })
})
