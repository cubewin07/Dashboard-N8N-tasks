import { admin } from './vi/admin'
import { adminIssues } from './vi/adminIssues'
import { adminOrg } from './vi/adminOrg'
import { adminPeople } from './vi/adminPeople'
import { adminRules } from './vi/adminRules'
import { activity } from './vi/activity'
import { common } from './vi/common'
import { credits } from './vi/credits'
import { library } from './vi/library'
import { login } from './vi/login'
import { office } from './vi/office'
import { org } from './vi/org'
import { queue } from './vi/queue'
import { settings } from './vi/settings'
import { sim } from './vi/sim'
import { wardrobe } from './vi/wardrobe'
import { wardrobeEditor } from './vi/wardrobeEditor'

export const vi = {
  common,
  library,
  settings,
  login,
  office,
  org,
  credits,
  activity,
  queue,
  sim,
  wardrobe,
  wardrobeEditor,
  admin,
  adminIssues,
  adminOrg,
  adminPeople,
  adminRules,
}

export type Messages = typeof vi
