import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'

const CreditsSchema = z.object({
  assets: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
      author: z.string(),
      source: z.string(),
      license: z.string(),
      modified: z.boolean().optional(),
    }),
  ),
})

type CreditAsset = z.infer<typeof CreditsSchema>['assets'][number]

interface CreditGroup {
  key: string
  author: string
  license: string
  source: string | null
  modified: boolean
  assets: CreditAsset[]
}

const LICENSE_URLS: Record<string, string> = {
  'own-CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'OFL-1.1': 'https://openfontlicense.org/open-font-license-official-text/',
}

async function fetchCredits(): Promise<CreditAsset[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}assets/credits.json`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return CreditsSchema.parse(await res.json()).assets
}

function groupCredits(assets: readonly CreditAsset[]): CreditGroup[] {
  const groups = new Map<string, CreditGroup>()
  for (const asset of assets) {
    const key = `${asset.author}|${asset.license}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        author: asset.author,
        license: asset.license,
        source: /^https?:\/\//.test(asset.source) ? asset.source : null,
        modified: false,
        assets: [],
      }
      groups.set(key, group)
    }
    group.assets.push(asset)
    group.modified ||= asset.modified === true
  }
  return [...groups.values()].sort((a, b) => b.assets.length - a.assets.length)
}

export function CreditsPage() {
  const { t } = useI18n()
  const { data, isPending, isError } = useQuery({
    queryKey: ['asset-credits'],
    queryFn: fetchCredits,
    staleTime: Infinity,
  })
  const groups = useMemo(() => groupCredits(data ?? []), [data])
  const licenseNames: Record<string, string> = t.credits.licenses

  return (
    <div className="space-y-6 pb-12" data-credits-page>
      <PageHeader
        title={t.credits.title}
        description={t.credits.description}
        actions={
          <Button asChild variant="outline">
            <Link to="/settings">{t.credits.backToSettings}</Link>
          </Button>
        }
      />

      {isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t.credits.loading}
        </p>
      ) : isError ? (
        <p role="alert" className="text-sm text-blocked">
          {t.credits.error}
        </p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.credits.empty}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {fmt(t.credits.summary, { count: data?.length ?? 0, authors: groups.length })}
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {groups.map((group) => (
              <li key={group.key} data-credits-group>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="break-words">{group.author}</CardTitle>
                    <CardDescription>
                      {fmt(t.credits.filesCount, { count: group.assets.length })}
                      {group.modified ? ` · ${t.credits.modifiedBadge}` : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>
                      <span className="text-muted-foreground">{t.credits.licenseLabel}: </span>
                      <a
                        href={LICENSE_URLS[group.license] ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {licenseNames[group.license] ?? group.license}
                      </a>
                    </p>
                    {group.source ? (
                      <p className="break-all">
                        <span className="text-muted-foreground">{t.credits.sourceLabel}: </span>
                        <a
                          href={group.source}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {group.source}
                        </a>
                      </p>
                    ) : null}
                    <details>
                      <summary className="cursor-pointer text-muted-foreground">
                        {t.credits.showFiles}
                      </summary>
                      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-2 text-xs text-muted-foreground">
                        {group.assets.map((asset) => (
                          <li key={asset.path} className="break-all">
                            <span className="text-foreground">{asset.title}</span> · {asset.path}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
