import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Copy,
  ExternalLink,
  Film,
  FileText,
  FolderSearch,
  ImageIcon,
  Loader2,
  Play,
  ArrowUpRight,
} from 'lucide-react'
import type { Tables } from '@/lib/database.types'
import { useArtifacts, useLookups } from '@/hooks/queries'
import { useDrive } from '@/app/drive'
import { useI18n } from '@/i18n'
import { demoPreviewUrl } from '@/lib/drive'
import { formatDateTime } from '@/lib/time'
import { fmt, cn } from '@/lib/utils'
import {
  PageHeader,
  ShopChip,
  EmployeeAvatar,
  WorkflowIcon,
  TimeAgo,
  EmptyState,
} from '@/components'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

type ArtifactTypeFilter = 'all' | 'image' | 'video' | 'text'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(sec: number | null): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function LibraryPage() {
  const { t, lang } = useI18n()
  const drive = useDrive()
  const { data: artifacts, isLoading } = useArtifacts()
  const { shop: shopMap, employee: employeeMap, workflow: workflowMap } = useLookups()

  const [shopFilter, setShopFilter] = useState<string>('all')
  const [workflowFilter, setWorkflowFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<ArtifactTypeFilter>('all')
  const [employeeFilter, setEmployeeFilter] = useState<string>('all')

  const [selectedArtifact, setSelectedArtifact] = useState<Tables<'artifacts'> | null>(null)

  const shops = useMemo(() => Array.from(shopMap.values()), [shopMap])
  const workflows = useMemo(() => Array.from(workflowMap.values()), [workflowMap])
  const employees = useMemo(() => Array.from(employeeMap.values()), [employeeMap])

  const filteredArtifacts = useMemo(() => {
    if (!artifacts) return []
    return artifacts.filter((a) => {
      if (shopFilter !== 'all' && a.shop_id !== Number(shopFilter)) return false
      if (workflowFilter !== 'all' && a.workflow_key !== workflowFilter) return false
      if (typeFilter !== 'all' && a.type !== typeFilter) return false
      if (employeeFilter !== 'all' && a.owner_key !== employeeFilter) return false
      return true
    })
  }, [artifacts, shopFilter, workflowFilter, typeFilter, employeeFilter])

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t.library.lightbox.copiedToast)
    } catch {
      toast.error(t.common.error.generic)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title={t.library.title} description={t.library.description} />

      {/* Google Drive invite banner when disconnected */}
      {!drive.connected && (
        <Card className="border-primary/20 bg-primary-soft/50">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base text-foreground">
                {t.library.driveBanner.title}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {t.library.driveBanner.description}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="md"
              onClick={() => void drive.connect()}
              disabled={drive.state === 'connecting'}
              className="w-full shrink-0 border-border bg-surface hover:bg-surface-muted sm:w-auto"
            >
              {drive.state === 'connecting' ? (
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
              ) : (
                <span
                  className="inline-flex size-5 items-center justify-center rounded-full bg-surface-muted text-xs font-bold text-primary shadow-xs ring-1 ring-border"
                  aria-hidden
                >
                  G
                </span>
              )}
              <span>
                {drive.state === 'connecting'
                  ? t.library.driveBanner.connecting
                  : t.library.driveBanner.connectButton}
              </span>
            </Button>
          </CardHeader>
        </Card>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {/* Shop filter */}
        <div className="w-full sm:w-44">
          <Select value={shopFilter} onValueChange={setShopFilter}>
            <SelectTrigger aria-label={t.library.filters.shop}>
              <SelectValue placeholder={t.library.filters.allShops} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.library.filters.allShops}</SelectItem>
              {shops.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Workflow filter */}
        <div className="w-full sm:w-48">
          <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
            <SelectTrigger aria-label={t.library.filters.workflow}>
              <SelectValue placeholder={t.library.filters.allWorkflows} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.library.filters.allWorkflows}</SelectItem>
              {workflows.map((w) => {
                const wfMeta = (t.common.workflows as Record<string, { name: string; short: string } | undefined>)[w.key]
                return (
                  <SelectItem key={w.key} value={w.key}>
                    {wfMeta?.name ?? w.name}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Type segmented buttons */}
        <div className="flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 sm:w-auto">
          {(['all', 'image', 'video', 'text'] as const).map((typeKey) => (
            <button
              key={typeKey}
              type="button"
              onClick={() => setTypeFilter(typeKey)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                typeFilter === typeKey
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
              )}
            >
              {t.library.filters.types[typeKey]}
            </button>
          ))}
        </div>

        {/* Employee filter */}
        <div className="w-full sm:w-44">
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger aria-label={t.library.filters.employee}>
              <SelectValue placeholder={t.library.filters.allEmployees} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.library.filters.allEmployees}</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.key} value={e.key}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid or loading or empty state */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-2.5 shadow-[var(--shadow-soft)]"
            >
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <Skeleton className="h-4 w-1/2 rounded-md" />
            </div>
          ))}
        </div>
      ) : filteredArtifacts.length === 0 ? (
        <EmptyState
          icon={FolderSearch}
          title={t.library.empty.title}
          description={t.library.empty.description}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {filteredArtifacts.map((artifact) => (
            <Card
              key={artifact.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedArtifact(artifact)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedArtifact(artifact)
                }
              }}
              className="group flex h-full cursor-pointer flex-col overflow-hidden transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
            >
              {/* Uniform aspect-[4/3] thumbnail area */}
              <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-surface-muted flex items-center justify-center">
                {drive.connected ? (
                  artifact.type === 'text' ? (
                    <div className="flex size-full flex-col items-center justify-center gap-1.5 p-3 text-center text-muted-foreground">
                      <FileText className="size-8 text-primary" aria-hidden />
                      <span className="text-xs font-medium text-foreground line-clamp-2">
                        {artifact.title}
                      </span>
                    </div>
                  ) : (
                    <>
                      <img
                        src={demoPreviewUrl(artifact)}
                        alt={artifact.title}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      {artifact.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-foreground/20">
                          <span className="flex items-center gap-1.5 rounded-full bg-foreground/75 px-2.5 py-1 text-xs font-medium text-background backdrop-blur-sm">
                            <Play className="size-3 fill-current" aria-hidden />
                            {artifact.duration_sec && (
                              <span className="tabular">
                                {formatDuration(artifact.duration_sec)}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </>
                  )
                ) : (
                  /* Disconnected Drive placeholder */
                  <div className="flex size-full flex-col items-center justify-center gap-1.5 p-3 text-center text-muted-foreground">
                    {artifact.type === 'image' && (
                      <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
                    )}
                    {artifact.type === 'video' && (
                      <Film className="size-8 text-muted-foreground" aria-hidden />
                    )}
                    {artifact.type === 'text' && (
                      <FileText className="size-8 text-muted-foreground" aria-hidden />
                    )}
                    <span className="text-[11px] text-muted-foreground/80">
                      {t.library.card.notConnected}
                    </span>
                  </div>
                )}
              </div>

              {/* Card metadata directly under the thumbnail */}
              <CardContent className="flex flex-1 flex-col justify-between gap-2 p-3 sm:p-3.5">
                <h3
                  className="truncate text-sm font-semibold text-foreground"
                  title={artifact.title}
                >
                  {artifact.title}
                </h3>

                <div className="flex items-center justify-between gap-1.5">
                  <ShopChip shopId={artifact.shop_id} className="max-w-[70%]" />
                  <EmployeeAvatar ownerKey={artifact.owner_key} size="sm" />
                </div>

                <div className="flex items-center justify-between border-t border-border/50 pt-1 text-[11px] text-muted-foreground sm:text-xs">
                  <TimeAgo iso={artifact.created_at} />
                  <span className="tabular">{formatBytes(artifact.size_bytes)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Lightbox Dialog (responsive down to 375px mobile) */}
      <Dialog
        open={selectedArtifact !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedArtifact(null)
        }}
      >
        {selectedArtifact && (
          <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
            <DialogHeader className="pr-6">
              <DialogTitle className="break-words text-base font-semibold leading-snug sm:text-lg">
                {selectedArtifact.title}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Preview container */}
              <div className="relative flex max-h-[38vh] w-full items-center justify-center overflow-hidden rounded-xl bg-surface-muted sm:max-h-[50vh]">
                {selectedArtifact.type === 'image' && (
                  <img
                    src={demoPreviewUrl(selectedArtifact)}
                    alt={selectedArtifact.title}
                    className="max-h-[38vh] w-full object-contain sm:max-h-[50vh]"
                  />
                )}

                {selectedArtifact.type === 'video' && (
                  <div className="relative flex size-full max-h-[38vh] items-center justify-center sm:max-h-[50vh]">
                    <img
                      src={demoPreviewUrl(selectedArtifact)}
                      alt={selectedArtifact.title}
                      className="max-h-[38vh] w-full object-contain opacity-95 sm:max-h-[50vh]"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-foreground/25 p-4 text-center">
                      <span className="flex size-12 items-center justify-center rounded-full bg-surface text-primary shadow-lg backdrop-blur-sm sm:size-14">
                        <Play className="ml-1 size-6 fill-current sm:size-7" aria-hidden />
                      </span>
                      <p className="max-w-xs rounded-lg bg-foreground/80 px-2.5 py-1 text-[11px] text-background backdrop-blur-sm sm:text-xs">
                        {t.library.lightbox.videoNote}
                      </p>
                    </div>
                  </div>
                )}

                {selectedArtifact.type === 'text' && (
                  <div className="flex size-full flex-col items-center justify-center gap-2.5 p-6 text-center">
                    <FileText className="size-10 text-primary sm:size-12" aria-hidden />
                    <p className="max-w-md text-xs text-muted-foreground sm:text-sm">
                      {t.library.lightbox.textNote}
                    </p>
                  </div>
                )}
              </div>

              {/* Metadata Details */}
              <div className="rounded-xl border border-border bg-surface-muted/40 p-3 sm:p-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.library.lightbox.detailsSection}
                </h4>
                <div className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-3 sm:gap-3">
                  <div>
                    <span className="text-muted-foreground">{t.library.lightbox.shop}:</span>
                    <div className="mt-1">
                      <ShopChip shopId={selectedArtifact.shop_id} className="max-w-full" />
                    </div>
                  </div>

                  <div>
                    <span className="text-muted-foreground">{t.library.lightbox.creator}:</span>
                    <div className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
                      <EmployeeAvatar ownerKey={selectedArtifact.owner_key} size="sm" />
                      <span className="truncate">
                        {employeeMap.get(selectedArtifact.owner_key)?.name ??
                          selectedArtifact.owner_key}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-muted-foreground">{t.library.lightbox.workflow}:</span>
                    <div className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
                      <WorkflowIcon workflowKey={selectedArtifact.workflow_key} />
                      <span className="truncate">
                        {(t.common.workflows as Record<string, { name: string; short: string } | undefined>)[selectedArtifact.workflow_key]?.name ??
                          selectedArtifact.workflow_key}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-muted-foreground">{t.library.lightbox.createdAt}:</span>
                    <p className="mt-1 font-medium text-foreground">
                      {formatDateTime(selectedArtifact.created_at, lang)}
                    </p>
                  </div>

                  <div>
                    <span className="text-muted-foreground">{t.library.lightbox.fileSize}:</span>
                    <p className="mt-1 font-medium tabular text-foreground">
                      {formatBytes(selectedArtifact.size_bytes)}
                    </p>
                  </div>

                  {selectedArtifact.width && selectedArtifact.height && (
                    <div>
                      <span className="text-muted-foreground">{t.library.lightbox.dimensions}:</span>
                      <p className="mt-1 font-medium tabular text-foreground">
                        {selectedArtifact.width} × {selectedArtifact.height} px
                      </p>
                    </div>
                  )}

                  {selectedArtifact.duration_sec && (
                    <div>
                      <span className="text-muted-foreground">{t.library.lightbox.duration}:</span>
                      <p className="mt-1 font-medium tabular text-foreground">
                        {formatDuration(selectedArtifact.duration_sec)} ({selectedArtifact.duration_sec}s)
                      </p>
                    </div>
                  )}

                  <div>
                    <span className="text-muted-foreground">{t.library.lightbox.mimeType}:</span>
                    <p className="mt-1 truncate font-medium text-foreground">
                      {selectedArtifact.mime}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button asChild variant="ghost" size="sm" className="w-full justify-center sm:w-auto">
                <Link to={`/tasks/${selectedArtifact.task_id}`}>
                  <ArrowUpRight className="size-4" aria-hidden />
                  <span>
                    {fmt(t.library.lightbox.goToTask, { id: selectedArtifact.task_id })}
                  </span>
                </Link>
              </Button>

              <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopyLink(selectedArtifact.drive_url)}
                  className="w-full justify-center sm:w-auto"
                >
                  <Copy className="size-4" aria-hidden />
                  <span>{t.library.lightbox.copyLink}</span>
                </Button>

                <Button asChild variant="primary" size="sm" className="w-full justify-center sm:w-auto">
                  <a
                    href={selectedArtifact.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    <span>{t.library.lightbox.openDrive}</span>
                  </a>
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
