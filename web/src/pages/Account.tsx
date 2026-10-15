import { motion } from 'motion/react'
import { KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useToast } from '../components/toast'
import { Avatar, Badge, Button, Card, ErrorNote, Input, PageHeader } from '../components/ui'
import { useAuth } from '../lib/auth'

export function PasswordForm({ onDone, submitLabel = 'Update password' }: { onDone?: () => void; submitLabel?: string }) {
  const { changePassword } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (form.next !== form.confirm) {
      setError('New passwords don’t match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await changePassword(form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      onDone?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.form onSubmit={submit} className="space-y-4">
      <Input id="pw-current" type="password" label="Current password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required />
      <Input id="pw-new" type="password" label="New password" autoComplete="new-password" minLength={6} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required />
      <Input id="pw-confirm" type="password" label="Repeat new password" autoComplete="new-password" minLength={6} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </motion.form>
  )
}

export default function Account() {
  const { user } = useAuth()
  const toast = useToast()
  const name = user?.name || user?.username || ''

  return (
    <>
      <PageHeader kicker="You" title="Account" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card tone="violet" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="dots self-start p-6">
          <div className="brut flex items-center gap-4 bg-cream p-4">
            <Avatar name={name} seed={user?.username} size="lg" photoId={user?.student?.has_photo ? user.student.id : undefined} />
            <div className="min-w-0">
              <p className="font-display text-2xl leading-tight uppercase">{name}</p>
              <p className="font-mono text-sm">@{user?.username}</p>
              {user?.email && <p className="truncate font-mono text-xs text-ink/70">{user.email}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={user?.role === 'student' ? 'pink' : 'sky'}>{user?.role}</Badge>
                {user?.student && <Badge tone="sun">{user.student.department}</Badge>}
                {user?.student && <Badge tone={user.student.enrolled ? 'lime' : 'tang'}>{user.student.enrolled ? 'Face enrolled' : 'No face'}</Badge>}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm font-medium">Changing your password signs you out everywhere else.</p>
        </Card>

        <Card initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <h2 className="flex items-center gap-2 border-b-[3px] border-ink bg-sun px-5 py-4 font-display text-2xl uppercase">
            <KeyRound size={22} strokeWidth={2.5} /> Change password
          </h2>
          <div className="p-5">
            <PasswordForm onDone={() => toast('Password updated')} />
          </div>
        </Card>
      </div>
    </>
  )
}
