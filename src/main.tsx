import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import '@fontsource-variable/inter'
import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import { watchInstall } from './lib/install'
import { rememberRef } from './lib/referral'
import { keepUpToDate } from './lib/updates'

// Students only ever open the check-in page from a QR code. They get no saved offline
// copy, so their phones never download the lecturer app in the background.
if (!location.pathname.startsWith('/session/') && location.pathname !== '/door') keepUpToDate()

watchInstall()
rememberRef()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
