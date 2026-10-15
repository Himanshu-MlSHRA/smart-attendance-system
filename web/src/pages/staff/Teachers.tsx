import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useToast } from '../../components/toast'
import { Avatar, Badge, Button, Card, Confirm, Empty, ErrorNote, IconButton, Input, Modal, PageHeader, Skeleton } from '../../components/ui'
import { api, type Teacher } from '../../lib/api'
import { fmtDate } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

export default function Teachers() {
  const toast = useToast()
  const { data, error, reload } = useLoad(api.teachers)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Teacher | null>(null)

  return (
    <>
      <PageHeader kicker="Staff" title="Teachers">
        <Button tone="violet" onClick={() => setAdding(true)} icon={<Plus size={18} strokeWidth={3} />}>
          Add teacher
        </Button>
      </PageHeader>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Skeleton className="h-40" />}
      {data?.length === 0 && <Empty title="No teachers yet">Add one, then assign them a course on the Classes page.</Empty>}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((t, i) => (
          <Card key={t.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }} className="flex items-start gap-3 p-4">
            <Avatar name={t.name} seed={t.username} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg leading-tight uppercase">{t.name}</p>
              <p className="font-mono text-xs">@{t.username}</p>
              {t.email && <p className="truncate font-mono text-xs text-ink/60">{t.email}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.courses ? t.courses.split(', ').map((c) => <Badge key={c} tone="lime">{c}</Badge>) : <Badge tone="cream">No courses</Badge>}
              </div>
              <p className="mt-2 font-mono text-[11px] text-ink/60">since {fmtDate(t.created_at)}</p>
            </div>
            <IconButton label={`Remove ${t.name}`} onClick={() => setDeleting(t)}>
              <Trash2 size={15} strokeWidth={2.5} />
            </IconButton>
          </Card>
        ))}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="New teacher" tone="violet">
        {adding && (
          <AddTeacher
            onDone={() => {
              setAdding(false)
              reload()
            }}
          />
        )}
      </Modal>
      <Confirm
        open={deleting !== null}
        title="Remove teacher?"
        confirmLabel="Remove"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api.deleteTeacher(deleting!.id)
          toast(`${deleting!.name} removed`)
          reload()
        }}
      >
        {deleting?.name} loses access. Their courses ({deleting?.courses || 'none'}) and attendance stay, with no teacher assigned.
      </Confirm>
    </>
  )
}

function AddTeacher({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.addTeacher(form)
      toast(`${form.name} added — they’ll set their own password on first sign-in`)
      onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input id="t-name" label="Full name" placeholder="Prof. Meera Iyer" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
      <div className="grid grid-cols-2 gap-4">
        <Input id="t-user" label="Username" placeholder="m.iyer" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <Input id="t-pass" label="Starting password" type="text" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
      </div>
      <Input id="t-email" type="email" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" tone="violet" className="w-full" disabled={busy}>
        {busy ? 'Adding…' : 'Add teacher'}
      </Button>
    </form>
  )
}
