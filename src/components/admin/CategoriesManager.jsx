import { useState } from 'react'
import { orderBy } from 'firebase/firestore'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useCollection } from '../../hooks/useCollection'

const STATUS_LABEL = {
  setup: 'Configurando',
  groups: 'Fase de grupos',
  knockout: 'Eliminatoria',
  finished: 'Finalizado',
}

export default function CategoriesManager() {
  const { data: categories, loading } = useCollection('categories', orderBy('createdAt', 'asc'))
  const [name, setName] = useState('')
  const [qualify, setQualify] = useState(2)
  const [knockoutEnabled, setKnockoutEnabled] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'categories'), {
        name: trimmed,
        qualifyPerGroup: Number(qualify) || 2,
        knockoutEnabled,
        status: 'setup',
        createdAt: serverTimestamp(),
      })
      setName('')
      setQualify(2)
      setKnockoutEnabled(true)
    } catch (err) {
      setError('No se pudo crear la categoría. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleKnockout(cat) {
    await updateDoc(doc(db, 'categories', cat.id), { knockoutEnabled: !cat.knockoutEnabled })
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta categoría? También deberías eliminar sus equipos y partidos desde Ajustes > Reiniciar torneo si quieres limpiarlo todo.')) return
    await deleteDoc(doc(db, 'categories', id))
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">Nueva categoría</div>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleCreate}>
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="cat-name">Nombre</label>
              <input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="U16, Senior, Femenino…"
                required
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="cat-qualify">Clasifican por grupo</label>
              <input
                id="cat-qualify"
                type="number"
                min={1}
                max={16}
                value={qualify}
                onChange={(e) => setQualify(e.target.value)}
              />
            </div>
          </div>
          <p className="meta" style={{ marginTop: -6, marginBottom: 14 }}>
            Si solo tienes un grupo, puedes poner p. ej. 4 clasificados: la
            eliminatoria se generará como semifinales 1º-4º y 2º-3º, y final.
          </p>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={knockoutEnabled}
              onChange={(e) => setKnockoutEnabled(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ textTransform: 'none', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--cream)' }}>
              Esta categoría tiene fase eliminatoria (semis/final)
            </span>
          </label>
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 6 }}>
            {saving ? 'Creando…' : 'Crear categoría'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="section-title">Categorías ({categories.length})</div>
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : categories.length === 0 ? (
          <div className="empty-state">Todavía no has creado ninguna categoría.</div>
        ) : (
          categories.map((c) => (
            <div className="list-item" key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <div className="meta">
                  Top {c.qualifyPerGroup ?? 2} por grupo clasifican
                  {c.knockoutEnabled === false ? ' · sin fase eliminatoria' : ' · con eliminatoria'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`chip ${c.status === 'finished' ? 'on' : ''}`}>
                  {STATUS_LABEL[c.status] || 'Configurando'}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => handleToggleKnockout(c)}>
                  {c.knockoutEnabled === false ? 'Activar eliminatoria' : 'Desactivar eliminatoria'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>
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
