import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, onSnapshot, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from '../hooks/useCollection'
import StandingsTable from '../components/public/StandingsTable.jsx'
import MatchesList from '../components/public/MatchesList.jsx'
import BracketView from '../components/public/BracketView.jsx'
import ScheduleView from '../components/public/ScheduleView.jsx'
import MvpRanking from '../components/public/MvpRanking.jsx'

export default function PublicView() {
  const { data: categories, loading: catLoading } = useCollection('categories', orderBy('createdAt', 'asc'))
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const [view, setView] = useState('groups') // 'groups' | 'bracket' | 'schedule' | 'mvp'
  const [meta, setMeta] = useState({ name: 'Torneo 3x3', description: '' })

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'meta', 'tournament'), (snap) => {
      if (snap.exists()) setMeta(snap.data())
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!activeCategoryId && categories.length) {
      setActiveCategoryId(categories[0].id)
    }
  }, [categories, activeCategoryId])

  const activeCategory = categories.find((c) => c.id === activeCategoryId)
  const knockoutEnabled = activeCategory?.knockoutEnabled !== false

  const { data: teams } = useCollection('teams')
  const { data: groups } = useCollection('groups')
  const { data: matches } = useCollection('matches')
  const { data: mvps } = useCollection('mvps')
  const [bracket, setBracket] = useState(null)

  useEffect(() => {
    if (!activeCategoryId) return
    const unsub = onSnapshot(doc(db, 'brackets', activeCategoryId), (snap) => {
      setBracket(snap.exists() ? snap.data() : null)
    })
    return unsub
  }, [activeCategoryId])

  const categoryGroups = useMemo(
    () => groups.filter((g) => g.categoryId === activeCategoryId),
    [groups, activeCategoryId]
  )
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])
  const groupsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups])
  const categoriesById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const categoryMatches = useMemo(
    () => matches.filter((m) => m.categoryId === activeCategoryId && m.phase === 'group'),
    [matches, activeCategoryId]
  )

  const TABS = [
    { id: 'groups', label: 'Fase de grupos' },
    { id: 'bracket', label: 'Eliminatoria' },
    { id: 'schedule', label: 'Horario' },
    { id: 'mvp', label: 'MVPs' },
  ]

  return (
    <div className="page">
      <header className="scoreboard-header">
        <div className="container">
          <div className="brand">
            <div className="brand-mark">
              3X3<span>LIVE</span>
            </div>
            <div className="brand-tag">{meta.name || 'Torneo 3x3'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="live-pill">
              <span className="live-dot" /> En directo
            </span>
            <Link to="/admin" className="btn btn-ghost btn-sm">
              Admin
            </Link>
          </div>
        </div>
      </header>

      <div className="container">
        {catLoading ? (
          <div className="empty-state">Cargando torneo…</div>
        ) : categories.length === 0 ? (
          <div className="empty-state">
            Todavía no hay categorías creadas. Vuelve pronto.
          </div>
        ) : (
          <>
            <div className="tab-row">
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={`tab-btn ${activeCategoryId === c.id ? 'active' : ''}`}
                  onClick={() => setActiveCategoryId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div className="tab-row" style={{ paddingTop: 0 }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`tab-btn ${view === t.id ? 'active' : ''}`}
                  onClick={() => setView(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {view === 'groups' && (
              <div className="stack" style={{ paddingBottom: 48 }}>
                {categoryGroups.length === 0 ? (
                  <div className="card">
                    <div className="empty-state">
                      La fase de grupos de {activeCategory?.name} aún no se ha generado.
                    </div>
                  </div>
                ) : (
                  categoryGroups
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((g) => {
                      const groupTeams = teams.filter((t) => g.teamIds.includes(t.id))
                      const groupMatches = categoryMatches.filter((m) => m.groupId === g.id)
                      return (
                        <div className="card" key={g.id}>
                          <div className="grid-2">
                            <div>
                              <div className="section-title">{g.name} · Clasificación</div>
                              <StandingsTable
                                teams={groupTeams}
                                matches={groupMatches}
                                qualifyCount={activeCategory?.qualifyPerGroup ?? 2}
                              />
                            </div>
                            <div>
                              <div className="section-title">{g.name} · Partidos</div>
                              <MatchesList matches={groupMatches} teamsById={teamsById} />
                            </div>
                          </div>
                        </div>
                      )
                    })
                )}
              </div>
            )}

            {view === 'bracket' && (
              <div className="card" style={{ marginBottom: 48 }}>
                <div className="section-title">Cuadro eliminatorio · {activeCategory?.name}</div>
                {knockoutEnabled ? (
                  <BracketView bracket={bracket} />
                ) : (
                  <div className="empty-state">
                    Esta categoría no tiene fase eliminatoria: la clasificación final es la
                    de la fase de grupos.
                  </div>
                )}
              </div>
            )}

            {view === 'schedule' && (
              <div className="card" style={{ marginBottom: 48 }}>
                <div className="section-title">Horario · todas las categorías y pistas</div>
                <ScheduleView
                  matches={matches}
                  teamsById={teamsById}
                  groupsById={groupsById}
                  categoriesById={categoriesById}
                />
              </div>
            )}

            {view === 'mvp' && (
              <div className="card" style={{ marginBottom: 48 }}>
                <div className="section-title">Ranking MVP del torneo</div>
                <MvpRanking mvps={mvps} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
