import { useEffect, useState } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Suscripción en tiempo real a una colección (o subcolección) de Firestore.
 * @param {string} path - ruta de la colección, p.ej. "teams"
 * @param {...import('firebase/firestore').QueryConstraint} constraints
 */
export function useCollection(path, ...constraints) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!path) return
    setLoading(true)
    const q = query(collection(db, path), ...constraints)
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, JSON.stringify(constraints.map((c) => c?.toString?.()))])

  return { data, loading, error }
}
