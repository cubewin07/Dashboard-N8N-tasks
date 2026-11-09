import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Tables } from '@/lib/database.types'
import { useI18n } from '@/i18n'

interface TaskFiltersBarProps {
  shops: Tables<'shops'>[]
  workflows: Tables<'workflows'>[]
  employees: Tables<'employees'>[]
  shopFilter: string
  workflowFilter: string
  employeeFilter: string
  onShopChange: (value: string) => void
  onWorkflowChange: (value: string) => void
  onEmployeeChange: (value: string) => void
  onReset: () => void
}

export function TaskFiltersBar({
  shops,
  workflows,
  employees,
  shopFilter,
  workflowFilter,
  employeeFilter,
  onShopChange,
  onWorkflowChange,
  onEmployeeChange,
  onReset,
}: TaskFiltersBarProps) {
  const { t } = useI18n()
  const hasActiveFilter = shopFilter !== 'all' || workflowFilter !== 'all' || employeeFilter !== 'all'

  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <div className="flex min-w-[140px] flex-1 flex-col gap-1 sm:w-44 sm:flex-none">
        <Label htmlFor="filter-shop" className="text-xs text-muted-foreground">
          {t.tasks.filters.shopLabel}
        </Label>
        <Select value={shopFilter} onValueChange={onShopChange}>
          <SelectTrigger id="filter-shop" aria-label={t.tasks.filters.shopLabel} className="h-9 text-xs sm:text-sm">
            <SelectValue placeholder={t.tasks.filters.allShops} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.tasks.filters.allShops}</SelectItem>
            {shops.map((shop) => (
              <SelectItem key={shop.id} value={String(shop.id)}>
                {shop.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-[140px] flex-1 flex-col gap-1 sm:w-48 sm:flex-none">
        <Label htmlFor="filter-workflow" className="text-xs text-muted-foreground">
          {t.tasks.filters.workflowLabel}
        </Label>
        <Select value={workflowFilter} onValueChange={onWorkflowChange}>
          <SelectTrigger id="filter-workflow" aria-label={t.tasks.filters.workflowLabel} className="h-9 text-xs sm:text-sm">
            <SelectValue placeholder={t.tasks.filters.allWorkflows} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.tasks.filters.allWorkflows}</SelectItem>
            {workflows.map((wf) => (
              <SelectItem key={wf.key} value={wf.key}>
                {t.common.workflows[wf.key as keyof typeof t.common.workflows]?.name ?? wf.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-[140px] flex-1 flex-col gap-1 sm:w-44 sm:flex-none">
        <Label htmlFor="filter-employee" className="text-xs text-muted-foreground">
          {t.tasks.filters.employeeLabel}
        </Label>
        <Select value={employeeFilter} onValueChange={onEmployeeChange}>
          <SelectTrigger id="filter-employee" aria-label={t.tasks.filters.employeeLabel} className="h-9 text-xs sm:text-sm">
            <SelectValue placeholder={t.tasks.filters.allEmployees} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.tasks.filters.allEmployees}</SelectItem>
            {employees.map((emp) => (
              <SelectItem key={emp.key} value={emp.key}>
                {emp.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilter && (
        <Button variant="ghost" size="sm" onClick={onReset} className="h-9 text-xs text-muted-foreground hover:text-foreground">
          <RotateCcw className="size-3.5" aria-hidden />
          {t.tasks.filters.reset}
        </Button>
      )}
    </div>
  )
}
