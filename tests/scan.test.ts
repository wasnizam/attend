import { describe, expect, it } from 'vitest'
import { checkInPath } from '../src/lib/scan'

describe('scanned check-in codes', () => {
  it('follows Dobry check-in and door codes', () => {
    expect(checkInPath('https://dobry.app/session/8K72QF?c=YAXE2')).toBe('/session/8K72QF?c=YAXE2')
    expect(checkInPath('https://www.dobry.app/door?t=AB12CD,EF34GH&c=X1')).toBe('/door?t=AB12CD,EF34GH&c=X1')
  })
  it('refuses anything else', () => {
    expect(checkInPath('https://evil.example/session/8K72QF')).toBeNull()
    expect(checkInPath('http://dobry.app/session/8K72QF')).toBeNull()
    expect(checkInPath('https://dobry.app/app/account')).toBeNull()
    expect(checkInPath('hello')).toBeNull()
  })
  it('follows the copy it runs on, for local testing', () => {
    expect(checkInPath('http://localhost:5173/session/8K72QF', 'localhost:5173')).toBe('/session/8K72QF')
  })
})
