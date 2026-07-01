import { useMemo, useState } from 'react'
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useCollection } from '../../hooks/useCollection'
import {
  distributeTeamsIntoGroups,
  generateRoundRobinMatches,
  groupLabel,
} from '../../utils/tournamentLogic'

export default function GroupsManager() {
  const { data: categories } = useCollection('categories', orderBy('createdAt', 'asc'))
  const { data: teams } = useCollection('teams')
  const { data: groups } = useCollection('groups')

  const [categoryId, setCategoryId] = useState('')
  const [numGroups, setNumGroups] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const categoryTeams = useMemo(
    () => teams.filter((t) => t.categoryId === categoryId),
    [teams, categoryId]
  )
  const categoryGroups = useMemo(
    () => groups.filter((g) => g.categoryId === categoryId).sort((a, b) => a.name.localeCompare(b.name)),
    [groups, categoryId]
  )
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])

  async function handleGenerate() {
    setError('')
    setOk('')
    if (!categoryId) {
      setError('Selecciona primero una categoría.')
      return
    }
    if (categoryTeams.length < 2) {
      setError('Necesitas al menos 2 equipos en esta categoría.')
      return
    }
    if (numGroups < 1 || numGroups > categoryTeams.length) {
      setError('El número de grupos no es válido para la cantidad de equipos.')
      return
    }
    if (categoryGroups.length > 0) {
      const sure = confirm(
        'Ya existen grupos y partidos para esta categoría. Generarlos de nuevo eliminará los grupos, partidos y la eliminatoria actuales. ¿Continuar?'
      )
      if (!sure) return
    }

    setBusy(true)
    try {
      // 1. borra grupos, partidos de grupo y eliminatoria anteriores de esta categoría
      const batchDelete = writeBatch(db)
      const oldGroups = await getDocs(query(collection(db, 'groups'), where('categoryId', '==', categoryId)))
      oldGroups.forEach((d) => batchDelete.delete(d.ref))
      const oldMatches = await getDocs(query(collection(db, 'matches'), where('categoryId', '==', categoryId)))
      oldMatches.forEach((d) => batchDelete.delete(d.ref))
      const oldMvps = await getDocs(query(collection(db, 'mvps'), where('categoryId', '==', categoryId)))
      oldMvps.forEach((d) => batchDelete.delete(d.ref))
      batchDelete.delete(doc(db, 'brackets', categoryId))
      await batchDelete.commit()

      // 2. distribuye equipos en grupos equilibrados
      const distributed = distributeTeamsIntoGroups(categoryTeams, Number(numGroups))

      const batchCreate = writeBatch(db)
      distributed.forEach((groupTeams, idx) => {
        const groupRef = doc(collection(db, 'groups'))
        batchCreate.set(groupRef, {
          categoryId,
          name: groupLabel(idx),
          teamIds: groupTeams.map((t) => t.id),
          createdAt: serverTimestamp(),
        })

        const roundRobin = generateRoundRobinMatches(groupTeams.map((t) => t.id))
        roundRobin.forEach((m) => {
          const matchRef = doc(collection(db, 'matches'))
          batchCreate.set(matchRef, {
            categoryId,
            groupId: groupRef.id,
            phase: 'group',
            teamAId: m.teamAId,
            teamBId: m.teamBId,
            bye: m.bye,
            round: m.round,
            status: m.bye ? 'finished' : 'pending',
            scoreA: null,
            scoreB: null,
            createdAt: serverTimestamp(),
          })
        })
      })
      await batchCreate.commit()

      await updateDoc(doc(db, 'categories', categoryId), { status: 'groups' })

      setOk(`Grupos y calendario generados: ${distributed.length} grupos, ${categoryTeams.length} equipos.`)
    } catch (err) {
      console.error(err)
      setError('Ocurrió un error generando los grupos. Revisa la consola.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">Generar grupos y calendario</div>
        {error && <div className="error-msg">{error}</div>}
        {ok && <div className="toast-msg">{ok}</div>}
        <div className="field-row">
          <div className="field">
            <label htmlFor="grp-cat">Categoría</label>
            <select id="grp-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Selecciona…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="grp-num">Número de grupos</label>
            <input
              id="grp-num"
              type="number"
              min={1}
              max={Math.max(1, categoryTeams.length)}
              value={numGroups}
              onChange={(e) => setNumGroups(e.target.value)}
            />
          </div>
        </div>
        <p className="meta" style={{ marginBottom: 14 }}>
          {categoryId
            ? `${categoryTeams.length} equipos disponibles en esta categoría.`
            : 'Selecciona una categoría para ver sus equipos.'}
        </p>
        <button className="btn btn-primary" onClick={handleGenerate} disabled={busy}>
          {busy ? 'Generando…' : 'Generar grupos y calendario'}
        </button>
      </div>

      {categoryId && (
        <div className="card">
          <div className="section-title">Grupos actuales de esta categoría</div>
          {categoryGroups.length === 0 ? (
            <div className="empty-state">Todavía no hay grupos generados.</div>
          ) : (
            <div className="grid-2">
              {categoryGroups.map((g) => (
                <div key={g.id}>
                  <div className="section-title" style={{ fontSize: 11 }}>
                    {g.name}
                  </div>
                  {g.teamIds.map((tid) => (
                    <div className="list-item" key={tid} style={{ padding: '8px 12px' }}>
                      <span>{teamsById[tid]?.name || '—'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
