import type { GrowthStage, SentRow } from '../data/billing'

/** Names for the follow-up emails and the customer's health, shared by the Growth page and each customer's page. */
export const STAGE_NAME: Record<GrowthStage, string> = {
  firstSession: 'First session nudge',
  invite: 'Invite friends',
  tips: 'Tips for their edition',
  quiet: 'Quiet for a week',
  winback: 'Come back',
}
export const HEALTH_LABEL: Record<string, string> = { new: 'Not started', healthy: 'Healthy', risk: 'At risk', inactive: 'Inactive' }
export const HEALTH_TONE: Record<string, string> = { new: 'bg-accent-soft text-accent', healthy: 'bg-good-soft text-good', risk: 'bg-[#fff4d6] text-[#8a5a00]', inactive: 'bg-slate-100 text-muted' }
export const CAME_BACK: Record<SentRow['cameBack'], [string, string]> = { yes: ['Came back', 'text-good'], no: ['Not yet', 'text-muted'], pending: ['Too early to tell', 'text-muted'] }
