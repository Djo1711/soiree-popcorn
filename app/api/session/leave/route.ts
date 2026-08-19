import { avecErreurs, ok } from '@/lib/api/respond'
import { SESSION_COOKIE } from '@/lib/session'

export async function POST(): Promise<Response> {
  return avecErreurs(async () => {
    const reponse = ok({ ok: true })
    reponse.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    return reponse
  })
}
