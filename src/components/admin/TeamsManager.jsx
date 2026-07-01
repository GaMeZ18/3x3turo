import { useMemo, useState } from 'react'
import { orderBy } from 'firebase/firestore'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useCollection } from '../../hooks/useCollection'

export default function TeamsManager() {
  const { data: categories } = useCollection('categories', orderBy('createdAt', 'asc'))
  const { data: teams, loading } = useCollection('teams', orderBy('createdAt', 'asc'))

  const [filterCategory, setFilterCategory] = useState('all')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [players, setPlayers] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const visibleTeams = useMemo(
    () => (filterCategory === 'all' ? teams : teams.filter((t) => t.categoryId === filterCategory)),
    [teams, filterCategory]
  )

  function categoryName(id) {
    return categories.find((c) => c.id === id)?.name || '—'
  }

  function resetForm() {
    setName('')
    setCategoryId('')
    setPlayers('')
    setEditingId(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !categoryId) {
      setError('Indica un nombre de equipo y selecciona una categoría.')
      return
    }
    setSaving(true)
    const playerList = players
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    try {
      if (editingId) {
        await updateDoc(doc(db, 'teams', editingId), {
          name: name.trim(),
          categoryId,
          players: playerList,
        })
      } else {
        await addDoc(collection(db, 'teams'), {
          name: name.trim(),
          categoryId,
          players: playerList,
          createdAt: serverTimestamp(),
        })
      }
      resetForm()
    } catch (err) {
      setError('No se pudo guardar el equipo.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(team) {
    setEditingId(team.id)
    setName(team.name)
    setCategoryId(team.categoryId)
    setPlayers((team.players || []).join(', '))
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este equipo? Si ya tiene partidos generados, deberás regenerar los grupos.')) return
    await deleteDoc(doc(db, 'teams', id))
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">{editingId ? 'Editar equipo' : 'Nuevo equipo'}</div>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="team-name">Nombre del equipo</label>
              <input id="team-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="team-cat">Categoría</label>
              <select id="team-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="team-players">Jugadores (opcional, separados por comas)</label>
            <input
              id="team-players"
              value={players}
              onChange={(e) => setPlayers(e.target.value)}
              placeholder="Ana García, Luis Pérez, Marta Ruiz"
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear equipo'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-ghost" onClick={resetForm}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="admin-topbar" style={{ marginBottom: 10 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            Equipos ({visibleTeams.length})
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="all">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : visibleTeams.length === 0 ? (
          <div className="empty-state">No hay equipos todavía.</div>
        ) : (
          visibleTeams.map((t) => (
            <div className="list-item" key={t.id}>
              <div>
                <strong>{t.name}</strong>
                <div className="meta">
                  {categoryName(t.categoryId)}
                  {t.players?.length ? ` · ${t.players.length} jugadores` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}>
                  Editar
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
