import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api, type User } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatBytes } from '../lib/format'
import AppShell from '../components/layout/AppShell'
import { IconSpinner, IconTrash } from '../components/ui/Icons'

interface Stats {
  users: number
  studies: number
  instances: number
  bytes_stored: number
}

export default function AdminPage() {
  const { t } = useTranslation('library')
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
        <h1 className="mb-6 text-base font-medium text-ink">{t('admin.title')}</h1>

        <div className="mb-8 grid grid-cols-4 gap-px overflow-hidden rounded border border-line bg-line">
          {[
            [t('admin.stats.users'), stats?.users],
            [t('admin.stats.studies'), stats?.studies],
            [t('admin.stats.images'), stats?.instances],
            [t('admin.stats.onDisk'), stats ? formatBytes(stats.bytes_stored) : undefined],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-panel px-4 py-3">
              <div className="text-2xs uppercase tracking-wider text-ink-dim">{label}</div>
              <div className="mt-1 num text-lg text-ink">{value ?? '—'}</div>
            </div>
          ))}
        </div>

        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-dim">
          {t('admin.accounts')}
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
                  {[
                    t('admin.columns.email'),
                    t('admin.columns.slug'),
                    t('admin.columns.role'),
                    t('admin.columns.status'),
                    '',
                  ].map((h, i) => (
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
                        {self && (
                          <span className="ml-1.5 text-2xs text-ink-faint">{t('admin.you')}</span>
                        )}
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
                          title={
                            self ? t('admin.cannotChangeOwnRole') : t('admin.toggleAdmin')
                          }
                        >
                          {u.is_admin ? t('admin.roleAdmin') : t('admin.roleUser')}
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
                          {u.is_active ? t('admin.active') : t('admin.disabled')}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          disabled={self}
                          className="tool-btn hover:text-danger disabled:opacity-30"
                          title={self ? t('admin.cannotDeleteSelf') : t('admin.deleteUser')}
                          onClick={() => {
                            if (confirm(t('admin.deleteUserConfirm', { email: u.email }))) {
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
