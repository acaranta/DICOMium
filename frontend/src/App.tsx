import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { IconSpinner } from './components/ui/Icons'
import Login from './pages/Login'
import Register from './pages/Register'
import LibraryPage from './pages/Library'
import ViewerPage from './pages/Viewer'
import AdminPage from './pages/Admin'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Studies do not change behind your back; refetching on every window focus just
      // burns requests.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function Protected({ children, adminOnly = false }: { children: JSX.Element; adminOnly?: boolean }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-faint">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !user.is_admin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <Protected>
                  <LibraryPage />
                </Protected>
              }
            />
            <Route
              path="/viewer/:studyUid"
              element={
                <Protected>
                  <ViewerPage />
                </Protected>
              }
            />
            <Route
              path="/admin"
              element={
                <Protected adminOnly>
                  <AdminPage />
                </Protected>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
