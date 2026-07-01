import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, orderBy, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useCollection } from '../../hooks/useCollection'
import { applyBracketResult, computeStandings, generateBracket } from '../../utils/tournamentLogic'
import BracketView from '../public/BracketView.jsx'
import MvpPicker from './MvpPicker.jsx'

export default function BracketManager() {
  const { data: categories } = useCollection('categories', orderBy('createdAt', 'asc'))
  const { data: teams } = useCollection('teams')
  const { data: groups } = useCollection('groups')
  const { data: matches } = useCollection('matches')

  const [categoryId, setCategoryId] = useState('')
  const [bracket, setBracket] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    if (!categoryId) {
      setBracket(null)
      return
    }
    const unsub = onSnapshot(doc(db, 'brackets', categoryId), (snap) => {
      setBracket(snap.exists() ? snap.data() : null)
    })
    return unsub
  }, [categoryId])

  const activeCategory = categories.find((c) => c.id === categoryId)
  const knockoutEnabled = activeCategory?.knockoutEnabled !== false
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])
  const categoryGroups = useMemo(
    () => groups.filter((g) => g.categoryId === categoryId).sort((a, b) => a.name.localeCompare(b.name)),
    [groups, categoryId]
  )
  const groupMatches = useMemo(
    () => matches.filter((m) => m.categoryId === categoryId && m.phase === 'group'),
    [matches, categoryId]
  )

  const groupsComplete = useMemo(() => {
    if (!categoryGroups.length) return false
    return categoryGroups.every((g) => {
      const gm = groupMatches.filter((m) => m.groupId === g.id && !m.bye)
      return gm.length > 0 && gm.every((m) => m.status === 'finished')
    })
  }, [categoryGroups, groupMatches])

  async function handleGenerate() {
    setError('')
    setOk('')
    if (!categoryId) return
    if (!groupsComplete) {
      setError('Todavía hay partidos de la fase de grupos sin resultado.')
      return
    }
    setBusy(true)
    try {
      const qualifyPerGroup = activeCategory?.qualifyPerGroup ?? 2
      const qualifiers = []
      categoryGroups.forEach((g, groupIndex) => {
        const groupTeams = teams.filter((t) => g.teamIds.includes(t.id))
        const groupTeamMatches = groupMatches.filter((m) => m.groupId === g.id)
        const standings = computeStandings(groupTeams, groupTeamMatches)
        standings.slice(0, qualifyPerGroup).forEach((s, rankIdx) => {
          qualifiers.push({
            teamId: s.teamId,
            teamName: s.teamName,
            groupIndex,
            rank: rankIdx + 1,
          })
        })
      })

      const built = generateBracket(qualifiers)
      await setDoc(doc(db, 'brackets', categoryId), {
        rounds: built.rounds,
        champion: null,
        generatedAt: Date.now(),
      })
      await updateDoc(doc(db, 'categories', categoryId), { status: 'knockout' })
      setOk('Cuadro eliminatorio generado correctamente.')
    } catch (err) {
      console.error(err)
      setError('No se pudo generar el cuadro eliminatorio.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveResult(roundIndex, matchIndex, scoreA, scoreB) {
    if (!bracket) return
    const updated = applyBracketResult(bracket, roundIndex, matchIndex, scoreA, scoreB)
    await setDoc(doc(db, 'brackets', categoryId), updated)
    if (updated.champion) {
      await updateDoc(doc(db, 'categories', categoryId), { status: 'finished' })
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">Fase eliminatoria</div>
        {error && <div className="error-msg">{error}</div>}
        {ok && <div className="toast-msg">{ok}</div>}
        <div className="field">
          <label>Categoría</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Selecciona…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {categoryId && !knockoutEnabled && (
          <div className="empty-state">
            Esta categoría está configurada sin fase eliminatoria (puedes activarla desde
            Categorías). La clasificación final es la de la fase de grupos.
          </div>
        )}
        {categoryId && knockoutEnabled && (
          <>
            <p className="meta" style={{ marginBottom: 14 }}>
              {groupsComplete
                ? 'La fase de grupos está completa: puedes generar el cuadro eliminatorio.'
                : 'Introduce todos los resultados de la fase de grupos antes de generar la eliminatoria.'}
            </p>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={busy || !groupsComplete}>
              {bracket ? 'Regenerar cuadro eliminatorio' : 'Generar cuadro eliminatorio'}
            </button>
          </>
        )}
      </div>

      {categoryId && knockoutEnabled && bracket && (
        <div className="card">
          <div className="section-title">Editar resultados</div>
          <EditableBracket bracket={bracket} onSave={handleSaveResult} teamsById={teamsById} categoryId={categoryId} categoryName={activeCategory?.name} />
          <hr className="rule" />
          <div className="section-title">Vista previa pública</div>
          <BracketView bracket={bracket} />
        </div>
      )}
    </div>
  )
}

function EditableBracket({ bracket, onSave, teamsById, categoryId, categoryName }) {
  return (
    <div className="stack">
      {bracket.rounds.map((round, rIdx) => (
        <div key={round.name}>
          <div className="section-title" style={{ fontSize: 11 }}>
            {round.name}
          </div>
          {round.matches.map((m, mIdx) =>
            m.bye || !m.teamAId || !m.teamBId ? null : (
              <ResultForm
                key={mIdx}
                match={m}
                onSave={(a, b) => onSave(rIdx, mIdx, a, b)}
                teamsById={teamsById}
                categoryId={categoryId}
                categoryName={categoryName}
                matchId={`${categoryId}_r${rIdx}_m${mIdx}`}
              />
            )
          )}
        </div>
      ))}
    </div>
  )
}

function ResultForm({ match, onSave, teamsById, categoryId, categoryName, matchId }) {
  const [scoreA, setScoreA] = useState(match.scoreA ?? '')
  const [scoreB, setScoreB] = useState(match.scoreB ?? '')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const teamA = teamsById[match.teamAId]
  const teamB = teamsById[match.teamBId]

  async function handleClick() {
    setErr('')
    if (scoreA === '' || scoreB === '') {
      setErr('Introduce ambos resultados.')
      return
    }
    setSaving(true)
    try {
      await onSave(Number(scoreA), Number(scoreB))
    } catch (e) {
      setErr(e.message || 'Error al guardar el resultado.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="list-item" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 200 }}>
        <strong>
          {match.teamAName} vs {match.teamBName}
        </strong>
        {match.status === 'finished' && (
          <div className="meta">Ganador: {match.winnerName}</div>
        )}
        {err && <div className="error-msg" style={{ marginTop: 6, marginBottom: 0 }}>{err}</div>}
        {match.status === 'finished' && teamA && teamB && (
          <MvpPicker
            matchId={matchId}
            categoryId={categoryId}
            categoryName={categoryName}
            teams={[teamA, teamB]}
            matchLabel={`${match.teamAName} vs ${match.teamBName}`}
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
        <button className="btn btn-primary btn-sm" onClick={handleClick} disabled={saving}>
          {saving ? '…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
