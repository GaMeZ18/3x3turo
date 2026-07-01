import { useMemo, useState } from 'react'
import { doc, orderBy, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useCollection } from '../../hooks/useCollection'
import StandingsTable from '../public/StandingsTable.jsx'
import MvpPicker from './MvpPicker.jsx'
import { formatMatchTime } from '../../utils/tournamentLogic'

export default function MatchesManager() {
  const { data: categories } = useCollection('categories', orderBy('createdAt', 'asc'))
  const { data: teams } = useCollection('teams')
  const { data: groups } = useCollection('groups')
  const { data: matches } = useCollection('matches')

  const [categoryId, setCategoryId] = useState('')
  const [groupId, setGroupId] = useState('')

  const activeCategory = categories.find((c) => c.id === categoryId)
  const categoryGroups = useMemo(
    () => groups.filter((g) => g.categoryId === categoryId).sort((a, b) => a.name.localeCompare(b.name)),
    [groups, categoryId]
  )
  const activeGroup = categoryGroups.find((g) => g.id === groupId) || categoryGroups[0]
  const groupTeams = useMemo(
    () => (activeGroup ? teams.filter((t) => activeGroup.teamIds.includes(t.id)) : []),
    [teams, activeGroup]
  )
  const groupMatches = useMemo(
    () =>
      activeGroup
        ? matches
            .filter((m) => m.groupId === activeGroup.id && !m.bye)
            .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0) || (a.round ?? 0) - (b.round ?? 0))
        : [],
    [matches, activeGroup]
  )
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">Selecciona categoría y grupo</div>
        <div className="field-row">
          <div className="field">
            <label>Categoría</label>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value)
                setGroupId('')
              }}
            >
              <option value="">Selecciona…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Grupo</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!categoryId}>
              <option value="">{categoryGroups.length ? 'Selecciona…' : 'Sin grupos'}</option>
              {categoryGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {activeGroup && (
        <div className="grid-2">
          <div className="card">
            <div className="section-title">Partidos · {activeGroup.name}</div>
            {groupMatches.length === 0 ? (
              <div className="empty-state">No hay partidos en este grupo.</div>
            ) : (
              groupMatches.map((m) => (
                <MatchRow
                  key={m.id}
                  match={m}
                  teamsById={teamsById}
                  categoryId={categoryId}
                  categoryName={activeCategory?.name}
                />
              ))
            )}
          </div>
          <div className="card">
            <div className="section-title">Clasificación · {activeGroup.name}</div>
            <StandingsTable teams={groupTeams} matches={groupMatches} />
          </div>
        </div>
      )}
    </div>
  )
}

function MatchRow({ match, teamsById, categoryId, categoryName }) {
  const [scoreA, setScoreA] = useState(match.scoreA ?? '')
  const [scoreB, setScoreB] = useState(match.scoreB ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const teamA = teamsById[match.teamAId]
  const teamB = teamsById[match.teamBId]

  async function handleSave() {
    setErr('')
    if (scoreA === '' || scoreB === '') {
      setErr('Introduce ambos resultados.')
      return
    }
    if (Number(scoreA) === Number(scoreB)) {
      setErr('No puede haber empate en 3x3.')
      return
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        scoreA: Number(scoreA),
        scoreB: Number(scoreB),
        status: 'finished',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="list-item" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 200 }}>
        <strong>
          {teamA?.name} vs {teamB?.name}
        </strong>
        <div className="meta">
          Jornada {match.round}
          {match.court ? ` · Pista ${match.court}` : ''}
          {match.startTime ? ` · ${formatMatchTime(match.startTime)}` : ''}
          {' · '}
          {match.status === 'finished' ? 'Finalizado' : 'Pendiente'}
        </div>
        {err && <div className="error-msg" style={{ marginTop: 6, marginBottom: 0 }}>{err}</div>}
        {match.status === 'finished' && teamA && teamB && (
          <MvpPicker
            matchId={match.id}
            categoryId={categoryId}
            categoryName={categoryName}
            teams={[teamA, teamB]}
            matchLabel={`${teamA.name} vs ${teamB.name}`}
          />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number"
          min={0}
          value={scoreA}
          onChange={(e) => setScoreA(e.target.value)}
          style={{ width: 64, background: 'var(--court-navy)', border: '1px solid rgba(245,240,230,0.15)', borderRadius: 6, padding: '8px 10px', color: 'var(--cream)' }}
        />
        <span className="meta">–</span>
        <input
          type="number"
          min={0}
          value={scoreB}
          onChange={(e) => setScoreB(e.target.value)}
          style={{ width: 64, background: 'var(--court-navy)', border: '1px solid rgba(245,240,230,0.15)', borderRadius: 6, padding: '8px 10px', color: 'var(--cream)' }}
        />
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? '…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
