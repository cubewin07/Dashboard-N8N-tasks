import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n'

export function OfficeCanvas() {
  const { t } = useI18n()
  const [ready, setReady] = useState(false)

  return (
    <div
      data-office-canvas
      data-ready={ready ? 'true' : 'false'}
      className="relative h-[calc(100dvh-11rem)] min-h-[420px] w-full overflow-hidden rounded-[14px] border border-border bg-surface"
    >
      <Canvas
        camera={{ position: [18, 14, 22], fov: 40 }}
        onCreated={() => {
          setReady(true)
        }}
      >
        <hemisphereLight args={['#faf9f7', '#e7e4de', 1.1]} />
        <directionalLight position={[16, 28, 18]} intensity={1.2} />

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <planeGeometry args={[56, 42]} />
          <meshStandardMaterial color="#f3f1ed" />
        </mesh>

        {/* Building footprint pad (24m x 14m) */}
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[24, 0.2, 14]} />
          <meshStandardMaterial color="#e6f2f1" />
        </mesh>

        <OrbitControls
          makeDefault
          enableDamping
          minDistance={8}
          maxDistance={60}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center sm:inset-x-6 sm:bottom-6">
        <div className="pointer-events-auto flex max-w-lg flex-col gap-2 rounded-[14px] border border-border bg-surface/95 p-4 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Building2 className="size-4" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-foreground">
              {t.office.placeholderTitle}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t.office.placeholderHint}
          </p>
          <div>
            <Link
              to="/org"
              className="inline-flex items-center text-xs font-semibold text-primary hover:underline"
            >
              {t.office.openOrgLink} →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OfficeCanvas
