import { CompactSkillInstallCard } from '@/components/compact-skill-install-card'
import { Button } from '@/components/ui/button'

export function StepSkill({ onAdvance, onBack }: { onAdvance: () => void; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Install compact-shim</h1>
        <p className="text-base text-muted-foreground">
          Cursor's <span className="font-mono">/compact</span> never reaches this proxy. Install the
          companion skill so your agent can produce hand-off summaries locally.
        </p>
      </div>

      <CompactSkillInstallCard />

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onAdvance}>Done</Button>
      </div>
    </div>
  )
}
