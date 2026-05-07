import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import '@fontsource/inter'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
import Layout from './Layout.jsx'
import AnalyzePage from './Analyze.jsx'
import AnalysisHistoryPage from './pages/AnalysisHistoryPage.jsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <AnalyzePage />
      },
      {
        path: 'analyze',
        element: <AnalyzePage />
      },
      {
        path: 'history',
        element: <AnalysisHistoryPage />
      }
    ]
  }
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
