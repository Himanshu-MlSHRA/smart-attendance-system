import { ArrowLeft, Mail, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ReportBody } from '../../components/report'
import { Avatar, Badge, Button, ErrorNote, PageSkeleton } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../lib/hooks'

export default function StudentProfile() {
  const id = Number(useParams().id)
  const { data, error } = useLoad(() => api.student(id), [id])

  if (error && !data) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <PageSkeleton tiles={0} />
  const s = data.student

  return (
    <>
      <Link to="/staff/students" className="mb-4 inline-flex items-center gap-1 font-mono text-xs font-bold uppercase hover:underline print:hidden">
        <ArrowLeft size={14} strokeWidth={3} /> Students
      </Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-5">
          <Avatar name={s.name} seed={s.roll_number} size="xl" photoId={s.has_photo && s.id} className="shadow-brut" />
          <div>
            <p className="mb-2 inline-block bg-ink px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.2em] text-sun">
              {s.roll_number} · {s.department}
            </p>
            <h1 className="font-display text-4xl leading-none uppercase sm:text-5xl">{s.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {s.enrolled ? <Badge tone="lime">Face enrolled</Badge> : <Badge tone="tang">No face</Badge>}
              {data.overall.defaulter && <Badge tone="tomato">Defaulter</Badge>}
              {s.email && (
                <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 font-mono text-xs font-bold underline">
                  <Mail size={13} strokeWidth={2.5} /> {s.email}
                </a>
              )}
            </div>
          </div>
        </div>
        <Button tone="cream" onClick={() => window.print()} icon={<Printer size={18} strokeWidth={3} />} className="print:hidden">
          Print report
        </Button>
      </div>
      <ReportBody report={data} />
    </>
  )
}
