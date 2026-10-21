import * as certificate from './_lib/certificateRoute.js'
import * as featureUse from './_lib/featureUseRoute.js'
import * as feedback from './_lib/feedbackRoute.js'
import * as growth from './_lib/growthRoute.js'
import * as health from './_lib/healthRoute.js'
import * as pay from './_lib/payRoute.js'
import * as unsubscribe from './_lib/unsubscribeRoute.js'
import { json } from './_lib/server.js'

/**
 * Several small endpoints served by one function, because the hosting plan allows a limited
 * number of functions. vercel.json sends /api/certificate, /api/pay, /api/feature-use,
 * /api/health, /api/growth, /api/unsubscribe and /api/feedback here with ?fn= naming which one, so their addresses do not change.
 */
type Route = { GET?: (r: Request) => Promise<Response>; POST?: (r: Request) => Promise<Response> }
const ROUTES: Record<string, Route> = { certificate, pay, 'feature-use': featureUse, health, growth, unsubscribe, feedback }

const handle = (method: 'GET' | 'POST') => (request: Request) => {
  // The name comes from ?fn= after the rewrite, or from the address itself if it arrives unchanged.
  const url = new URL(request.url)
  const route = ROUTES[url.searchParams.get('fn') ?? url.pathname.split('/').pop() ?? '']
  const run = route?.[method]
  return run ? run(request) : Promise.resolve(json({ error: 'Not found.' }, 404))
}

export const GET = handle('GET')
export const POST = handle('POST')
