import { motion } from 'motion/react'
import { useState } from 'react'
import { Badge, Empty, ErrorNote, PageHeader, Segmented, Skeleton, type Tone } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtRelDay } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

const groups = [
  ['', 'All'],
  ['attendance', 'Marks'],
  ['request', 'Requests'],
  ['student', 'Students'],
  ['session', 'Classes'],
  ['face', 'Faces'],
] as const

const tone = (action: string): Tone =>
  action.startsWith('attendance') ? 'sky' : action.startsWith('request') ? 'tang' : action.includes('delete') ? 'tomato' : action.startsWith('session') ? 'lime' : action.startsWith('face') || action.startsWith('model') ? 'violet' : 'sun'

/** Who changed what, and when. Every manual mark, decision and deletion lands here. */
export default function Audit() {
  const [group, setGroup] = useState<(typeof groups)[number][0]>('')
  const { data, error } = useLoad(() => api.audit(group || undefined), [group])

  return (
    <>
      <PageHeader kicker="Accountability" title="Audit log">
        <Segmented id="audit-group" value={group} onChange={setGroup} options={groups} />
      </PageHeader>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Skeleton className="h-80" />}
      {data?.length === 0 && <Empty title="Nothing logged" />}
      {data && data.length > 0 && (
        <div className="brut overflow-x-auto bg-cream">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b-[3px] border-ink bg-sun font-mono text-xs uppercase tracking-wider">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">What</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a, i) => {
                const detail = JSON.parse(a.detail || '{}') as Record<string, unknown>
                return (
                  <motion.tr
                    key={a.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { delay: Math.min(i, 20) * 0.015 } }}
                    className="border-b-2 border-ink/15 align-top last:border-b-0"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                      {fmtRelDay(a.at)} {a.at.slice(11, 16)}
                    </td>
                    <td className="px-4 py-2.5 font-bold">{a.username ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={tone(a.action)}>{a.action}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(detail).map(([k, v]) => (
                          <span key={k} className="border-2 border-ink/20 px-1.5 font-mono text-[11px]">
                            <span className="text-ink/50">{k}</span> {String(v)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
