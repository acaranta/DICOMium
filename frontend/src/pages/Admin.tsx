import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type User } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatBytes } from '../lib/dicom'
import AppShell from '../components/layout/AppShell'
import { IconSpinner, IconTrash } from '../components/ui/Icons'

interface Stats {
  users: number
  studies: number
  instances: number
  bytes_stored: number
}

export default function AdminPage() {
  const { user: me } = useAuth()
  const queryClient = useQueryClient()

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<User[]>('/api/admin/users'),
  })
  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<Stats>('/api/admin/stats'),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<User> }) =>
      api.patch(`/api/admin/users/${id}`, body),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/users/${id}`),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  })

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-4xl overflow-y-auto px-6 py-6">
        <h1 className="mb-6 text-base font-medium text-ink">Administration</h1>

        <div className="mb-8 grid grid-cols-4 gap-px overflow-hidden rounded border border-line bg-line">
          {[
            ['Users', stats?.users],
            ['Studies', stats?.studies],
            ['Images', stats?.instances],
            ['On disk', stats ? formatBytes(stats.bytes_stored) : undefined],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-panel px-4 py-3">
              <div className="text-2xs uppercase tracking-wider text-ink-dim">{label}</div>
              <div className="mt-1 num text-lg text-ink">{value ?? '—'}</div>
            </div>
          ))}
        </div>

        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-dim">
          Accounts
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-10 text-ink-faint">
            <IconSpinner className="h-5 w-5" />
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-line">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-panel">
                  {['Email', 'Storage slug', 'Role', 'Status', ''].map((h, i) => (
                    <th
                      key={h || i}
                      className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-dim"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users?.map((u) => {
                  const self = u.id === me?.id
                  return (
                    <tr key={u.id} className="border-b border-line bg-base last:border-0">
                      <td className="px-3 py-2.5 text-xs text-ink">
                        {u.email}
                        {self && <span className="ml-1.5 text-2xs text-ink-faint">(you)</span>}
                      </td>
                      <td className="px-3 py-2.5 num text-2xs text-ink-faint">
                        /dicomfiles/{u.slug}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          disabled={self}
                          onClick={() =>
                            patch.mutate({ id: u.id, body: { is_admin: !u.is_admin } })
                          }
                          className={`rounded border px-1.5 py-0.5 text-2xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            u.is_admin
                              ? 'border-accent-dim bg-accent-dim/20 text-accent'
                              : 'border-line bg-raised text-ink-dim hover:border-line-bright'
                          }`}
                          title={self ? 'You cannot change your own role' : 'Toggle admin'}
                        >
                          {u.is_admin ? 'Admin' : 'User'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          disabled={self}
                          onClick={() =>
                            patch.mutate({ id: u.id, body: { is_active: !u.is_active } })
                          }
                          className={`rounded border px-1.5 py-0.5 text-2xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            u.is_active
                              ? 'border-ok/40 bg-ok/10 text-ok'
                              : 'border-danger/40 bg-danger/10 text-danger'
                          }`}
                        >
                          {u.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          disabled={self}
                          className="tool-btn hover:text-danger disabled:opacity-30"
                          title={self ? 'You cannot delete yourself' : 'Delete this user and all their exams'}
                          onClick={() => {
                            if (
                              confirm(
                                `Delete ${u.email}?\n\nThis also deletes every exam they uploaded, from disk. This cannot be undone.`,
                              )
                            ) {
                              remove.mutate(u.id)
                            }
                          }}
                        >
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
