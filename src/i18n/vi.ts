import { common } from './vi/common'
import { inbox } from './vi/inbox'
import { library } from './vi/library'
import { login } from './vi/login'
import { office } from './vi/office'
import { org } from './vi/org'
import { overview } from './vi/overview'
import { settings } from './vi/settings'
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
}

export type Messages = typeof vi
