export default function MvpRanking({ mvps, categoryFilter }) {
  const filtered = categoryFilter ? mvps.filter((m) => m.categoryId === categoryFilter) : mvps

  if (!filtered.length) {
    return (
      <div className="empty-state">
        Todavía no se ha votado ningún MVP. Se irán acumulando partido a partido.
      </div>
    )
  }

  const counts = new Map()
  for (const v of filtered) {
    const key = `${v.teamId}::${v.playerName}`
    if (!counts.has(key)) {
      counts.set(key, {
        playerName: v.playerName,
        teamName: v.teamName,
        categoryName: v.categoryName,
        count: 0,
      })
    }
    counts.get(key).count += 1
  }

  const rows = Array.from(counts.values()).sort((a, b) => b.count - a.count)

  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th>Jugador/a</th>
          <th>Equipo</th>
          <th>Categoría</th>
          <th>MVPs</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.playerName}-${r.teamName}`} className={i === 0 ? 'qualifies' : ''}>
            <td className="team-name">
              <span className="rank-badge">{i + 1}</span>
              {r.playerName}
            </td>
            <td>{r.teamName}</td>
            <td>{r.categoryName}</td>
            <td className="pts">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
