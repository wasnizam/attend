/**
 * What the phone app remembers about its first run, on this phone only: that the welcome screen
 * was seen, and that the camera was explained before the phone first asked for it.
 */
const WELCOMED = 'dobry.app.welcomed'
const CAMERA = 'dobry.app.cameraExplained'

const read = (key: string) => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return true // Storage blocked: never trap anyone on the welcome screen.
  }
}
const write = (key: string) => {
  try {
    localStorage.setItem(key, '1')
  } catch {
    // Not remembered; it shows once more next time, nothing worse.
  }
}

export const welcomed = () => read(WELCOMED)
export const markWelcomed = () => write(WELCOMED)
export const cameraExplained = () => read(CAMERA)
export const markCameraExplained = () => write(CAMERA)
