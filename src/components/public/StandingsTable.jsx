import { computeStandings } from '../../utils/tournamentLogic'

export default function StandingsTable({ teams, matches, qualifyCount = 2 }) {
  if (!teams.length) {
    return <div className="empty-state">Sin equipos en este grupo todavía.</div>
  }

  const rows = computeStandings(teams, matches)

  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th>Equipo</th>
          <th>PJ</th>
          <th>G</th>
          <th>P</th>
          <th>PF</th>
          <th>PC</th>
          <th>DIF</th>
          <th>PTS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.teamId} className={i < qualifyCount ? 'qualifies' : ''}>
            <td className="team-name">
              <span className="rank-badge">{i + 1}</span>
              {r.teamName}
            </td>
            <td>{r.played}</td>
            <td>{r.wins}</td>
            <td>{r.losses}</td>
            <td>{r.pointsFor}</td>
            <td>{r.pointsAgainst}</td>
            <td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
            <td className="pts">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
