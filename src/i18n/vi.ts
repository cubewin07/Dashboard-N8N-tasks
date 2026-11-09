import { common } from './vi/common'
import { overview } from './vi/overview'
import { inbox } from './vi/inbox'
import { tasks } from './vi/tasks'
import { start } from './vi/start'
import { library } from './vi/library'
import { team } from './vi/team'
import { settings } from './vi/settings'
import { login } from './vi/login'
import { taskDetail } from './vi/taskDetail'


export const vi = { common, overview, inbox, tasks, start, library, team, settings, login, taskDetail }

export type Messages = typeof vi
