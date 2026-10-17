import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { SiteLayout } from './components/layout/SiteLayout'
import { GuestDrawPage } from './components/pages/GuestDrawPage'
import { GuestResultPage } from './components/pages/GuestResultPage'
import { LandingPage } from './components/pages/LandingPage'
import { LoginPage } from './components/pages/LoginPage'
import { NotFoundPage } from './components/pages/NotFoundPage'
import { RegisterPage } from './components/pages/RegisterPage'
import { AuthProvider } from './context/AuthProvider'
import { I18nProvider } from './i18n/I18nProvider'
import { Toaster } from './components/ui/toast'

const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'guest-draw', element: <GuestDrawPage /> },
      { path: 'guest-result', element: <GuestResultPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

function App() {
  return (
    <I18nProvider>
      {/* One session provider and toast viewport are shared by all routes. */}
      <AuthProvider>
        <Toaster>
          <RouterProvider router={router} />
        </Toaster>
      </AuthProvider>
    </I18nProvider>
  )
}

export default App
