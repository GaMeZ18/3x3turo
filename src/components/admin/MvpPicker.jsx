import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'

/**
 * Selector de MVP para un partido ya finalizado. Guarda el voto en la
 * colección `mvps`, un documento por partido (se puede corregir).
 *
 * teams: [{ id, name, players }] — los dos equipos del partido
 */
export default function MvpPicker({ matchId, categoryId, categoryName, teams, matchLabel }) {
  const [playerKey, setPlayerKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const options = teams.flatMap((t) =>
    t.players?.length
      ? t.players.map((p) => ({ key: `${t.id}::${p}`, teamId: t.id, teamName: t.name, playerName: p }))
      : [{ key: `${t.id}::__team__`, teamId: t.id, teamName: t.name, playerName: t.name }]
  )

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'mvps', matchId))
        if (active && snap.exists()) {
          const d = snap.data()
          setPlayerKey(`${d.teamId}::${d.playerName}`)
          setSaved(true)
        }
      } catch (err) {
        console.error('Error cargando el MVP:', err)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [matchId])

  async function handleSave() {
    const opt = options.find((o) => o.key === playerKey)
    if (!opt) return
    setSaving(true)
    setError('')
    try {
      await setDoc(doc(db, 'mvps', matchId), {
        categoryId,
        categoryName,
        matchLabel,
        teamId: opt.teamId,
        teamName: opt.teamName,
        playerName: opt.playerName,
        awardedAt: Date.now(),
      })
      setSaved(true)
    } catch (err) {
      console.error('Error guardando el MVP:', err)
      if (err?.code === 'permission-denied') {
        setError('Firestore ha denegado el guardado. Publica la última versión de firestore.rules (incluye la colección "mvps").')
      } else {
        setError(err?.message || 'No se pudo guardar el MVP.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={playerKey}
          onChange={(e) => {
            setPlayerKey(e.target.value)
            setSaved(false)
            setError('')
          }}
          style={{ maxWidth: 220 }}
        >
          <option value="">🏅 MVP del partido…</option>
          {teams.map((t) => (
            <optgroup key={t.id} label={t.name}>
              {options
                .filter((o) => o.teamId === t.id)
                .map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.playerName}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={handleSave} disabled={!playerKey || saving}>
          {saving ? '…' : saved ? 'MVP guardado ✓' : 'Guardar MVP'}
        </button>
      </div>
      {error && <div className="error-msg" style={{ marginTop: 6, marginBottom: 0 }}>{error}</div>}
    </div>
  )
}
