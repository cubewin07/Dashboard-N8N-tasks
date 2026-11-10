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
}

export type Messages = typeof vi
