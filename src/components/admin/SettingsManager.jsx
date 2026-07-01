import { useEffect, useState } from 'react'
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext.jsx'

const RESETTABLE_COLLECTIONS = ['mvps', 'matches', 'groups', 'teams', 'categories', 'brackets']

async function deleteCollection(colName) {
  const snap = await getDocs(collection(db, colName))
  if (snap.empty) return 0
  const chunks = []
  let current = writeBatch(db)
  let count = 0
  snap.forEach((d) => {
    current.delete(d.ref)
    count += 1
    if (count === 450) {
      chunks.push(current)
      current = writeBatch(db)
      count = 0
    }
  })
  chunks.push(current)
  for (const batch of chunks) {
    await batch.commit()
  }
  return snap.size
}

export default function SettingsManager() {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, 'meta'))
      const metaDoc = snap.docs.find((d) => d.id === 'tournament')
      if (metaDoc) {
        setName(metaDoc.data().name || '')
        setDescription(metaDoc.data().description || '')
      }
    }
    load()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await setDoc(doc(db, 'meta', 'tournament'), { name, description })
      setOk('Datos del torneo guardados.')
      setTimeout(() => setOk(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (confirmText !== 'REINICIAR') return
    setResetting(true)
    setResetError('')
    setOk('')
    try {
      let total = 0
      for (const col of RESETTABLE_COLLECTIONS) {
        total += await deleteCollection(col)
      }
      setOk(`El torneo se ha reiniciado por completo (${total} documentos eliminados).`)
      setConfirmText('')
    } catch (err) {
      console.error('Error reiniciando el torneo:', err)
      if (err?.code === 'permission-denied') {
        setResetError(
          'Firestore ha denegado el borrado (permission-denied). Revisa que hayas publicado ' +
            'la última versión de firestore.rules en la consola de Firebase (Firestore Database → Reglas).'
        )
      } else {
        setResetError(`No se pudo reiniciar el torneo: ${err?.message || err}`)
      }
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="section-title">Datos del torneo</div>
        {ok && <div className="toast-msg">{ok}</div>}
        <form onSubmit={handleSave}>
          <div className="field">
            <label htmlFor="t-name">Nombre del torneo</label>
            <input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Torneo 3x3 Ciudad 2026" />
          </div>
          <div className="field">
            <label htmlFor="t-desc">Descripción</label>
            <textarea
              id="t-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Información general, sede, fechas…"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar datos'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="section-title">Cuenta</div>
        <p className="meta">Sesión iniciada como {user?.email}</p>
      </div>

      <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
        <div className="section-title" style={{ color: 'var(--foul-red)' }}>
          Zona de peligro · Reiniciar torneo
        </div>
        <p className="meta" style={{ marginBottom: 14 }}>
          Esto eliminará permanentemente todas las categorías, equipos, grupos, partidos,
          cuadros eliminatorios y MVPs. No se puede deshacer. Escribe <strong>REINICIAR</strong> para confirmar.
        </p>
        {resetError && <div className="error-msg">{resetError}</div>}
        <div className="inline-form">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="REINICIAR"
            style={{ maxWidth: 200 }}
          />
          <button
            className="btn btn-danger"
            onClick={handleReset}
            disabled={confirmText !== 'REINICIAR' || resetting}
          >
            {resetting ? 'Reiniciando…' : 'Reiniciar torneo completo'}
          </button>
        </div>
      </div>
    </div>
  )
}
