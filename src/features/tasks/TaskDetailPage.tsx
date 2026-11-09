import { useParams } from 'react-router-dom'
import { TaskDetail } from './detail/TaskDetail'

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const taskId = Number(id)

  return (
    <section>
      <TaskDetail taskId={Number.isFinite(taskId) ? taskId : -1} showBackLink />
    </section>
  )
}
