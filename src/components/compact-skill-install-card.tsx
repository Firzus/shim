import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { COMPACT_SKILL_INSTALL } from '@/lib/cursor-byok'
import { cn } from '@/lib/utils'

interface CompactSkillInstallCardProps {
  className?: string
}

export function CompactSkillInstallCard({ className }: CompactSkillInstallCardProps) {
  const [copied, setCopied] = useState(false)

  async function copyInstallCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText(COMPACT_SKILL_INSTALL)
      setCopied(true)
      toast.success('Install command copied to clipboard')
      window.setTimeout(() => setCopied(false), 1_500)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to copy')
    }
  }

  return (
    <div className={cn('rounded-lg border border-border bg-card p-5', className)}>
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          compact-shim skill
        </p>
        <h3 className="text-base font-semibold tracking-tight">Enable /compact hand-offs</h3>
        <p className="text-sm text-muted-foreground">
          Cursor's /compact never reaches this proxy. Install the companion skill so your coding
          agent produces the hand-off summary from the current conversation.
        </p>
      </div>

      <div className="mt-4 space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Install via skills CLI
        </p>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
            {COMPACT_SKILL_INSTALL}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void copyInstallCommand()}
            className={cn('shrink-0', copied && 'border-success/40 text-success')}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          After installation, ask your agent to run <code className="font-mono">/compact</code> or
          “compact this conversation” before opening a fresh chat.
        </p>
      </div>
    </div>
  )
}
