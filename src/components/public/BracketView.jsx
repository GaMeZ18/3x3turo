export default function BracketView({ bracket }) {
  if (!bracket || !bracket.rounds?.length) {
    return (
      <div className="empty-state">
        La fase eliminatoria todavía no se ha generado. Aparecerá aquí en cuanto
        termine la fase de grupos.
      </div>
    )
  }

  return (
    <div>
      <div className="bracket-scroll">
        <div className="bracket">
          {bracket.rounds.map((round, rIdx) => (
            <div className="bracket-round" key={round.name}>
              <div className="bracket-round-title">{round.name}</div>
              {round.matches.map((m, mIdx) => (
                <Slot key={mIdx} match={m} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {bracket.champion ? (
        <div className="champion-banner">
          <div className="label">🏆 Campeón del torneo</div>
          <div className="name">{bracket.champion.name}</div>
        </div>
      ) : null}
    </div>
  )
}

function Slot({ match }) {
  const aWins = match.status === 'finished' && Number(match.scoreA) > Number(match.scoreB)
  const bWins = match.status === 'finished' && Number(match.scoreB) > Number(match.scoreA)

  return (
    <div className="bracket-match">
      <div className={`bracket-slot ${aWins ? 'winner' : ''} ${!match.teamAName ? 'tbd' : ''}`}>
        <span className="name">{match.teamAName || 'Por definir'}</span>
        {match.status === 'finished' && <span className="score">{match.scoreA}</span>}
      </div>
      <div className={`bracket-slot ${bWins ? 'winner' : ''} ${!match.teamBName ? 'tbd' : ''}`}>
        <span className="name">{match.bye ? 'BYE' : match.teamBName || 'Por definir'}</span>
        {match.status === 'finished' && <span className="score">{match.scoreB}</span>}
      </div>
    </div>
  )
}
