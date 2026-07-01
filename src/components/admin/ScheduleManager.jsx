import { useMemo, useState } from 'react'
import { writeBatch, doc, orderBy } from 'firebase/firestore'
import { db } from '../../firebase'
import { useCollection } from '../../hooks/useCollection'
import { interleaveByRound, scheduleGroupMatches, formatMatchTime } from '../../utils/tournamentLogic'

function defaultStartValue() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  d.setSeconds(0, 0)
  // redondea a la próxima hora en punto, como valor de partida cómodo
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

export default function ScheduleManager() {
  const { data: categories } = useCollection('categories', orderBy('createdAt', 'asc'))
  const { data: groups } = useCollection('groups')
  const { data: teams } = useCollection('teams')
  const { data: matches } = useCollection('matches')

  const [startValue, setStartValue] = useState(defaultStartValue())
  const [duration, setDuration] = useState(12)
  const [rest, setRest] = useState(3)
  const [numCourts, setNumCourts] = useState(4)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])
  const categoriesById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const groupsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups])

  const pendingMatches = useMemo(
    () => matches.filter((m) => m.phase === 'group' && !m.bye),
    [matches]
  )

  const scheduledMatches = useMemo(
    () =>
      pendingMatches
        .filter((m) => m.startTime)
        .sort((a, b) => a.startTime - b.startTime || a.court - b.court),
    [pendingMatches]
  )

  const byCourtPreview = useMemo(() => {
    const map = {}
    for (const m of scheduledMatches) {
      map[m.court] = map[m.court] || []
      map[m.court].push(m)
    }
    return map
  }, [scheduledMatches])

  async function handleGenerate() {
    setError('')
    setOk('')
    if (pendingMatches.length === 0) {
      setError('Todavía no hay partidos de fase de grupos generados en ninguna categoría.')
      return
    }
    if (!startValue) {
      setError('Indica la hora de inicio del torneo.')
      return
    }

    setBusy(true)
    try {
      // agrupa los partidos por grupo (categoría+grupo) y los ordena por jornada
      const groupedByGroupId = {}
      for (const m of pendingMatches) {
        groupedByGroupId[m.groupId] = groupedByGroupId[m.groupId] || []
        groupedByGroupId[m.groupId].push(m)
      }
      // orden estable de grupos: por categoría (orden de creación) y luego nombre de grupo
      const groupOrder = groups
        .slice()
        .sort((a, b) => {
          const catA = categories.findIndex((c) => c.id === a.categoryId)
          const catB = categories.findIndex((c) => c.id === b.categoryId)
          if (catA !== catB) return catA - catB
          return a.name.localeCompare(b.name)
        })
        .map((g) => g.id)

      const groupedMatches = groupOrder
        .map((gid) => (groupedByGroupId[gid] || []).slice().sort((a, b) => (a.round ?? 0) - (b.round ?? 0)))
        .filter((g) => g.length > 0)

      const ordered = interleaveByRound(groupedMatches)
      const startTime = new Date(startValue).getTime()

      const assignments = scheduleGroupMatches(ordered, {
        startTime,
        matchDurationMin: Number(duration) || 12,
        restMin: Number(rest) || 3,
        numCourts: Number(numCourts) || 4,
      })

      const batches = []
      let current = writeBatch(db)
      let count = 0
      for (const a of assignments) {
        current.update(doc(db, 'matches', a.id), {
          court: a.court,
          slot: a.slot,
          startTime: a.startTime,
        })
        count += 1
        if (count === 450) {
          batches.push(current)
          current = writeBatch(db)
          count = 0
        }
      }
      batches.push(current)
      for (const b of batches) await b.commit()

      setOk(`Horario generado: ${assignments.length} partidos repartidos en ${numCourts} pistas.`)
    } catch (err) {
      console.error(err)
      setError(err.message || 'No se pudo generar el horario.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">Generar horario de la fase de grupos</div>
        {error && <div className="error-msg">{error}</div>}
        {ok && <div className="toast-msg">{ok}</div>}
        <p className="meta" style={{ marginBottom: 14 }}>
          Reparte automáticamente todos los partidos de fase de grupos (de todas las
          categorías) entre las pistas disponibles, intentando que ningún equipo juegue
          dos partidos seguidos sin descanso siempre que sea posible.
        </p>
        <div className="field-row">
          <div className="field">
            <label htmlFor="sch-start">Inicio del torneo</label>
            <input id="sch-start" type="datetime-local" value={startValue} onChange={(e) => setStartValue(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sch-courts">Nº de pistas</label>
            <input id="sch-courts" type="number" min={1} max={12} value={numCourts} onChange={(e) => setNumCourts(e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="sch-duration">Duración del partido (min)</label>
            <input id="sch-duration" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sch-rest">Descanso entre partidos (min)</label>
            <input id="sch-rest" type="number" min={0} value={rest} onChange={(e) => setRest(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleGenerate} disabled={busy}>
          {busy ? 'Generando…' : scheduledMatches.length ? 'Regenerar horario completo' : 'Generar horario'}
        </button>
      </div>

      {scheduledMatches.length > 0 && (
        <div className="card">
          <div className="section-title">Vista previa por pista ({scheduledMatches.length} partidos)</div>
          <div className="grid-2">
            {Object.keys(byCourtPreview)
              .sort((a, b) => Number(a) - Number(b))
              .map((court) => (
                <div key={court}>
                  <div className="section-title" style={{ fontSize: 11 }}>
                    Pista {court}
                  </div>
                  {byCourtPreview[court].map((m) => {
                    const group = groupsById[m.groupId]
                    const cat = categoriesById[m.categoryId]
                    return (
                      <div className="list-item" key={m.id} style={{ padding: '8px 12px' }}>
                        <div>
                          <strong>
                            {teamsById[m.teamAId]?.name} vs {teamsById[m.teamBId]?.name}
                          </strong>
                          <div className="meta">
                            {cat?.name} · {group?.name} · Jornada {m.round}
                          </div>
                        </div>
                        <span className="chip on">{formatMatchTime(m.startTime)}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
