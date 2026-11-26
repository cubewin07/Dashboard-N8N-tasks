import { admin } from './vi/admin'
import { adminIssues } from './vi/adminIssues'
import { adminOrg } from './vi/adminOrg'
import { adminPeople } from './vi/adminPeople'
import { adminRules } from './vi/adminRules'
import { activity } from './vi/activity'
import { common } from './vi/common'
import { credits } from './vi/credits'
import { inbox } from './vi/inbox'
import { library } from './vi/library'
import { login } from './vi/login'
import { office } from './vi/office'
import { org } from './vi/org'
import { overview } from './vi/overview'
import { queue } from './vi/queue'
import { settings } from './vi/settings'
import { sim } from './vi/sim'
import { start } from './vi/start'
import { taskDetail } from './vi/taskDetail'
import { tasks } from './vi/tasks'
import { team } from './vi/team'
import { wardrobe } from './vi/wardrobe'
import { wardrobeEditor } from './vi/wardrobeEditor'

export const vi = {
  common,
  overview,
  inbox,
  tasks,
  start,
  library,
  team,
  settings,
  login,
  taskDetail,
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
