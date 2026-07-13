import TagInspector from './TagInspector'
import MeasurementsPanel from './MeasurementsPanel'

export default function RightPanel({
  panel,
  sopUid,
}: {
  panel: 'tags' | 'measurements'
  sopUid: string | null
}) {
  return panel === 'tags' ? <TagInspector sopUid={sopUid} /> : <MeasurementsPanel />
}
