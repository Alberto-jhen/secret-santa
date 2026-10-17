import { serveProtectedPost } from '../_shared/http.ts'
import { rpc } from '../_shared/supabase.ts'

serveProtectedPost(
  'x-cleanup-secret',
  'GUEST_CLEANUP_SECRET',
  async () => {
    const deletedDraws = await rpc<number>('purge_expired_guest_draws', {})
    return { payload: { deletedDraws } }
  },
)
