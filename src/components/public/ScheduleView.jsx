import { formatMatchTime } from '../../utils/tournamentLogic'

export default function ScheduleView({ matches, teamsById, groupsById, categoriesById }) {
  const scheduled = matches
    .filter((m) => m.phase === 'group' && !m.bye && m.startTime)
    .sort((a, b) => a.startTime - b.startTime || a.court - b.court)

  if (!scheduled.length) {
    return (
      <div className="empty-state">
        El horario de partidos todavía no se ha publicado. Aparecerá aquí en cuanto el
        administrador lo genere.
      </div>
    )
  }

  return (
    <div>
      {scheduled.map((m) => {
        const finished = m.status === 'finished'
        return (
          <div className="match-row" key={m.id} style={{ gridTemplateColumns: 'auto 1fr auto 1fr' }}>
            <div className="chip on" style={{ whiteSpace: 'nowrap' }}>
              {formatMatchTime(m.startTime)} · Pista {m.court}
            </div>
            <div className="match-team">{teamsById[m.teamAId]?.name || '—'}</div>
            <div className={`match-score${finished ? '' : ' pending'}`}>
              {finished ? `${m.scoreA} - ${m.scoreB}` : 'vs'}
            </div>
            <div className="match-team right">
              {teamsById[m.teamBId]?.name || '—'}
              <div className="match-meta" style={{ textAlign: 'right' }}>
                {categoriesById[m.categoryId]?.name} · {groupsById[m.groupId]?.name}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
