// Small per-device preferences. Never required: every read has a default.
const ROTATE = 'attend.rotate'

/** Whether new sessions on this device start with the rotating QR on. */
export function rotatePref(): boolean {
  try {
    return localStorage.getItem(ROTATE) === '1'
  } catch {
    return false
  }
}

export function setRotatePref(on: boolean) {
  try {
    localStorage.setItem(ROTATE, on ? '1' : '0')
  } catch {
    // Not remembered; the toggle on the live screen still works.
  }
}
