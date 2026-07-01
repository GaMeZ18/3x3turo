import { formatMatchTime } from '../../utils/tournamentLogic'

export default function MatchesList({ matches, teamsById }) {
  const playable = matches.filter((m) => !m.bye)

  if (!playable.length) {
    return <div className="empty-state">Todavía no hay partidos generados.</div>
  }

  const nameOf = (id) => teamsById[id]?.name || '—'

  return (
    <div>
      {playable
        .slice()
        .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0) || (a.round ?? 0) - (b.round ?? 0))
        .map((m) => {
          const finished = m.status === 'finished'
          const aWins = finished && Number(m.scoreA) > Number(m.scoreB)
          const bWins = finished && Number(m.scoreB) > Number(m.scoreA)
          return (
            <div key={m.id}>
              <div className="match-row">
                <div className={`match-team${aWins ? ' winner' : ''}`}>{nameOf(m.teamAId)}</div>
                <div className={`match-score${finished ? '' : ' pending'}`}>
                  {finished ? `${m.scoreA} - ${m.scoreB}` : 'Pendiente'}
                </div>
                <div className={`match-team right${bWins ? ' winner' : ''}`}>{nameOf(m.teamBId)}</div>
              </div>
              <div className="match-meta">
                Jornada {m.round}
                {m.court ? ` · Pista ${m.court}` : ''}
                {m.startTime ? ` · ${formatMatchTime(m.startTime)}` : ''}
              </div>
            </div>
          )
        })}
    </div>
  )
}
