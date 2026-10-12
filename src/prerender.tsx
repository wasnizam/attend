import { renderToString } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router'
import { Home } from './pages/Home'
import { Landing } from './pages/Landing'
import { Legal } from './pages/Legal'

/**
 * Draws a public page to plain HTML, when the site is built. The result is written into the
 * page's file, so a search engine or a link preview that runs no script still reads the whole
 * page, and a visitor sees it before the app has loaded. Only the public pages: nothing here
 * needs a login, and it is the same components the browser uses, in English.
 */
export function render(path: string): string {
  return renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lecturers" element={<Landing show="lecturers" />} />
        <Route path="/trainers" element={<Landing show="trainers" />} />
        <Route path="/workplace" element={<Landing show="workplace" />} />
        <Route path="/terms" element={<Legal doc="terms" />} />
        <Route path="/privacy" element={<Legal doc="privacy" />} />
      </Routes>
    </StaticRouter>,
  )
}
