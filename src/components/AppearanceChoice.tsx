import { useState } from 'react'
import { t } from '../lib/i18n'
import { type ThemeChoice, setThemeChoice, themeChoice } from '../lib/theme'
import { inputClass } from './ui'

/** Automatic (follow this phone or computer), Light or Dark. Remembered on this device. */
export function AppearanceChoice() {
  const [choice, setChoice] = useState<ThemeChoice>(themeChoice)
  return (
    <select
      aria-label={t('Appearance')}
      value={choice}
      onChange={(e) => {
        const next = e.target.value as ThemeChoice
        setThemeChoice(next)
        setChoice(next)
      }}
      className={inputClass}
    >
      <option value="system">{t('Automatic')}</option>
      <option value="light">{t('Light')}</option>
      <option value="dark">{t('Dark')}</option>
    </select>
  )
}
