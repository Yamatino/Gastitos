import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initNetworkMonitoring } from './lib/errors.ts'

initNetworkMonitoring()

createRoot(document.getElementById('root')!).render(
  <App />
)
