// ---------------------------------------------------------------------------
// Lógica pura del torneo. Sin dependencias de Firebase: recibe datos, devuelve
// estructuras listas para escribir en Firestore o para pintar en pantalla.
// ---------------------------------------------------------------------------

/** Baraja un array (Fisher-Yates) sin mutar el original. */
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Reparte equipos en N grupos de forma equilibrada (serpiente),
 * mezclando primero para que la distribución no dependa del orden de alta.
 */
export function distributeTeamsIntoGroups(teams, numGroups) {
  const shuffled = shuffle(teams)
  const groups = Array.from({ length: numGroups }, () => [])
  let dir = 1
  let g = 0
  for (const team of shuffled) {
    groups[g].push(team)
    if (dir === 1 && g === numGroups - 1) dir = -1
    else if (dir === -1 && g === 0) dir = 1
    else g += dir
  }
  return groups
}

const GROUP_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function groupLabel(index) {
  return `Grupo ${GROUP_NAMES[index] ?? index + 1}`
}

/**
 * Genera el calendario de liga (todos contra todos) para un grupo de equipos
 * usando el método del círculo. Si el número de equipos es impar, se añade
 * un equipo fantasma "BYE": los partidos contra BYE no se juegan y descansa
 * automáticamente el equipo emparejado ese turno.
 * Devuelve una lista de partidos { teamAId, teamBId, bye, round }.
 */
export function generateRoundRobinMatches(teamIds) {
  const ids = [...teamIds]
  const hasBye = ids.length % 2 !== 0
  if (hasBye) ids.push('BYE')

  const n = ids.length
  const rounds = n - 1
  const half = n / 2
  const arr = [...ids]
  const matches = []

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const teamA = arr[i]
      const teamB = arr[n - 1 - i]
      if (teamA !== 'BYE' && teamB !== 'BYE') {
        matches.push({
          teamAId: teamA,
          teamBId: teamB,
          round: r + 1,
          bye: false,
        })
      } else {
        // el equipo que no es BYE descansa esta jornada
        const resting = teamA === 'BYE' ? teamB : teamA
        matches.push({
          teamAId: resting,
          teamBId: null,
          round: r + 1,
          bye: true,
        })
      }
    }
    // rotación: se fija el primer elemento, el resto rota
    const fixed = arr[0]
    const rest = arr.slice(1)
    rest.unshift(rest.pop())
    arr.splice(0, arr.length, fixed, ...rest)
  }

  return matches
}

/**
 * Calcula la clasificación de un grupo a partir de los partidos finalizados.
 * Orden: puntos > diferencia de puntos > puntos a favor.
 */
export function computeStandings(teams, matches) {
  const table = new Map()
  for (const team of teams) {
    table.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      points: 0,
    })
  }

  for (const m of matches) {
    if (m.bye || m.status !== 'finished') continue
    const a = table.get(m.teamAId)
    const b = table.get(m.teamBId)
    if (!a || !b) continue
    const scoreA = Number(m.scoreA) || 0
    const scoreB = Number(m.scoreB) || 0

    a.played += 1
    b.played += 1
    a.pointsFor += scoreA
    a.pointsAgainst += scoreB
    b.pointsFor += scoreB
    b.pointsAgainst += scoreA

    if (scoreA > scoreB) {
      a.wins += 1
      a.points += 2
      b.losses += 1
    } else if (scoreB > scoreA) {
      b.wins += 1
      b.points += 2
      a.losses += 1
    }
  }

  const rows = Array.from(table.values()).map((r) => ({
    ...r,
    diff: r.pointsFor - r.pointsAgainst,
  }))

  rows.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points
    if (y.diff !== x.diff) return y.diff - x.diff
    return y.pointsFor - x.pointsFor
  })

  return rows
}

const KNOCKOUT_ROUND_NAMES = {
  2: ['Final'],
  4: ['Semifinales', 'Final'],
  8: ['Cuartos de final', 'Semifinales', 'Final'],
  16: ['Octavos de final', 'Cuartos de final', 'Semifinales', 'Final'],
}

function nextPowerOfTwo(n) {
  let p = 1
  while (p < n) p *= 2
  return p
}

/**
 * A partir de los clasificados (top N de cada grupo, N = qualifyPerGroup)
 * construye el cuadro eliminatorio completo. Devuelve { rounds: [{ name, matches }] }
 * Los partidos incluyen matchIndex, teamAId/teamBId (o null si aún no
 * definido), bye y slot de destino en la siguiente ronda.
 *
 * qualifiers: array de { teamId, teamName, groupIndex, rank } (rank 1..N)
 *
 * La siembra es en zigzag: primero todos los 1º de cada grupo (orden de
 * grupo ascendente), luego todos los 2º (orden descendente), luego los 3º
 * (ascendente), etc. Esto separa a los mejores equipos en el cuadro incluso
 * cuando clasifican más de dos equipos por grupo, o cuando solo hay un
 * grupo (p. ej. 4 clasificados de un único grupo de 5 quedan emparejados
 * como semifinales 1º vs 4º y 2º vs 3º).
 */
export function generateBracket(qualifiers) {
  if (!qualifiers.length) return { rounds: [] }

  const numGroups = Math.max(...qualifiers.map((q) => q.groupIndex)) + 1
  const maxRank = Math.max(...qualifiers.map((q) => q.rank))

  const seeds = []
  for (let r = 1; r <= maxRank; r++) {
    const groupOrder =
      r % 2 === 1
        ? Array.from({ length: numGroups }, (_, i) => i)
        : Array.from({ length: numGroups }, (_, i) => numGroups - 1 - i)
    for (const gi of groupOrder) {
      const q = qualifiers.find((q) => q.groupIndex === gi && q.rank === r)
      if (q) seeds.push(q)
    }
  }

  const size = nextPowerOfTwo(seeds.length || 1)
  while (seeds.length < size) seeds.push(null) // hueco = BYE

  const roundNames =
    KNOCKOUT_ROUND_NAMES[size] ||
    Array.from({ length: Math.log2(size) }, (_, i) =>
      i === Math.log2(size) - 1 ? 'Final' : `Ronda ${i + 1}`
    )

  // Orden de bracket clásico (seed 1 vs seed size, 2 vs size-1, alternando
  // de forma que las mitades del cuadro queden equilibradas)
  const order = buildSeedOrder(size)
  const orderedSeeds = order.map((i) => seeds[i] ?? null)

  const rounds = []
  let currentTeams = orderedSeeds
  let roundIdx = 0

  while (currentTeams.length > 1) {
    const matches = []
    for (let i = 0; i < currentTeams.length; i += 2) {
      const a = currentTeams[i]
      const b = currentTeams[i + 1]
      const bye = !a || !b
      matches.push({
        matchIndex: i / 2,
        teamAId: a ? a.teamId : null,
        teamBId: b ? b.teamId : null,
        teamAName: a ? a.teamName : null,
        teamBName: b ? b.teamName : null,
        bye,
        // si hay BYE, el equipo presente avanza automáticamente
        winnerId: bye ? (a ? a.teamId : b ? b.teamId : null) : null,
        winnerName: bye ? (a ? a.teamName : b ? b.teamName : null) : null,
      })
    }
    rounds.push({ name: roundNames[roundIdx], matches })

    // prepara los "equipos" virtuales de la siguiente ronda a partir de
    // los ganadores conocidos (huecos si el partido aún no se ha jugado)
    currentTeams = matches.map((m) =>
      m.winnerId ? { teamId: m.winnerId, teamName: m.winnerName } : null
    )
    roundIdx += 1
  }

  return { rounds }
}

/** Orden de siembra clásico de un cuadro de `size` posiciones (1,size,size/2+1,...) */
function buildSeedOrder(size) {
  if (size === 1) return [0]
  let seeds = [0, 1]
  while (seeds.length < size) {
    const n = seeds.length * 2
    const newSeeds = []
    for (const s of seeds) {
      newSeeds.push(s)
      newSeeds.push(n - 1 - s)
    }
    seeds = newSeeds
  }
  return seeds
}

/** Limpia en cascada las rondas siguientes cuando un resultado cambia. */
function clearForward(rounds, roundIndex, matchIndex) {
  const nextRoundIndex = roundIndex + 1
  if (!rounds[nextRoundIndex]) return
  const nextMatchIndex = Math.floor(matchIndex / 2)
  const slot = matchIndex % 2 === 0 ? 'A' : 'B'
  const nextMatch = rounds[nextRoundIndex].matches[nextMatchIndex]
  if (!nextMatch) return
  nextMatch[`team${slot}Id`] = null
  nextMatch[`team${slot}Name`] = null
  nextMatch.status = 'pending'
  nextMatch.scoreA = null
  nextMatch.scoreB = null
  nextMatch.winnerId = null
  nextMatch.winnerName = null
  clearForward(rounds, nextRoundIndex, nextMatchIndex)
}

/**
 * Aplica el resultado de un partido de la fase eliminatoria y propaga
 * automáticamente al ganador hacia la siguiente ronda. Devuelve un nuevo
 * objeto bracket ({ rounds, champion }) listo para guardar en Firestore.
 */
export function applyBracketResult(bracket, roundIndex, matchIndex, scoreA, scoreB) {
  const rounds = bracket.rounds.map((r) => ({
    ...r,
    matches: r.matches.map((m) => ({ ...m })),
  }))
  const match = rounds[roundIndex].matches[matchIndex]
  if (match.bye) return { ...bracket, rounds }
  if (scoreA === scoreB) {
    throw new Error('El partido no puede terminar en empate.')
  }

  match.scoreA = scoreA
  match.scoreB = scoreB
  match.status = 'finished'
  const winner =
    scoreA > scoreB
      ? { id: match.teamAId, name: match.teamAName }
      : { id: match.teamBId, name: match.teamBName }
  match.winnerId = winner.id
  match.winnerName = winner.name

  let champion = bracket.champion ?? null

  if (roundIndex === rounds.length - 1) {
    champion = winner
  } else {
    const nextRoundIndex = roundIndex + 1
    const nextMatchIndex = Math.floor(matchIndex / 2)
    const slot = matchIndex % 2 === 0 ? 'A' : 'B'
    const nextMatch = rounds[nextRoundIndex].matches[nextMatchIndex]
    nextMatch[`team${slot}Id`] = winner.id
    nextMatch[`team${slot}Name`] = winner.name
    nextMatch.bye = !nextMatch.teamAId || !nextMatch.teamBId
    nextMatch.status = 'pending'
    nextMatch.scoreA = null
    nextMatch.scoreB = null
    nextMatch.winnerId = null
    nextMatch.winnerName = null
    clearForward(rounds, nextRoundIndex, nextMatchIndex)
    champion = null
  }

  return { rounds, champion, generatedAt: bracket.generatedAt ?? null }
}

// ---------------------------------------------------------------------------
// PISTAS Y HORARIO
// ---------------------------------------------------------------------------

/**
 * Intercala los partidos de varios grupos/categorías por jornada, para que
 * el horario avance "ronda 1 de todos los grupos, ronda 2 de todos los
 * grupos..." en vez de agotar un grupo entero antes de pasar al siguiente.
 * `groupedMatches` es un array de arrays (un array de partidos por grupo,
 * cada uno ya ordenado por `round`).
 */
export function interleaveByRound(groupedMatches) {
  const result = []
  const maxRounds = Math.max(0, ...groupedMatches.map((g) => g.length))
  for (let r = 0; r < maxRounds; r++) {
    for (const group of groupedMatches) {
      if (group[r]) result.push(group[r])
    }
  }
  return result
}

/**
 * Genera el horario de la fase de grupos repartiendo los partidos entre
 * `numCourts` pistas físicas compartidas por todo el torneo. Cada partido
 * dura `matchDurationMin` minutos y hay `restMin` minutos de descanso antes
 * del siguiente partido en esa pista.
 *
 * Algoritmo por turnos ("list scheduling"): para cada turno de tiempo,
 * intenta llenar TODAS las pistas disponibles con partidos cuyos equipos
 * estén libres, antes de pasar al turno siguiente. Así se aprovechan las 4
 * pistas en paralelo en vez de apilar los partidos en la primera pista
 * libre. Dentro de un turno, prioriza primero los partidos en los que
 * ambos equipos llevan al menos un turno completo de descanso desde su
 * último partido; solo si no hay suficientes para llenar el turno, admite
 * partidos con el descanso mínimo (evitando siempre que un equipo juegue
 * dos partidos en el mismo turno).
 *
 * `orderedMatches`: partidos ya intercalados (ver `interleaveByRound`),
 * cada uno con al menos { id, teamAId, teamBId }.
 *
 * Devuelve un array [{ id, court, slot, startTime }] (startTime en ms epoch).
 */
export function scheduleGroupMatches(
  orderedMatches,
  { startTime, matchDurationMin = 12, restMin = 3, numCourts = 4 } = {}
) {
  const slotLengthMs = (matchDurationMin + restMin) * 60 * 1000
  const teamLastSlot = new Map() // teamId -> último turno asignado
  const results = []

  // Cola de partidos pendientes, en el orden de prioridad recibido.
  let pending = orderedMatches.map((m) => m)

  let slot = 0
  const maxSlots = orderedMatches.length + 200 // margen de seguridad generoso

  while (pending.length > 0 && slot < maxSlots) {
    const usedTeamsThisSlot = new Set()
    let courtsUsed = 0
    const stillPending = []
    const deferred = [] // partidos que no cumplen el descanso "ideal" pero sí el mínimo

    // Pasada 1: coloca los partidos que respetan un turno extra de descanso
    for (const m of pending) {
      if (courtsUsed >= numCourts) {
        stillPending.push(m)
        continue
      }
      const { teamAId: a, teamBId: b } = m
      if (usedTeamsThisSlot.has(a) || usedTeamsThisSlot.has(b)) {
        stillPending.push(m)
        continue
      }
      const lastA = teamLastSlot.has(a) ? teamLastSlot.get(a) : -Infinity
      const lastB = teamLastSlot.has(b) ? teamLastSlot.get(b) : -Infinity
      const hasRestGap = slot >= lastA + 2 && slot >= lastB + 2
      if (!hasRestGap) {
        deferred.push(m)
        continue
      }
      courtsUsed += 1
      usedTeamsThisSlot.add(a)
      usedTeamsThisSlot.add(b)
      teamLastSlot.set(a, slot)
      teamLastSlot.set(b, slot)
      results.push({ id: m.id, court: courtsUsed, slot, startTime: startTime + slot * slotLengthMs })
    }

    // Pasada 2: si quedan pistas libres en este turno, rellena con partidos
    // que solo cumplen el descanso mínimo (equipo no repite en el mismo turno)
    for (const m of deferred) {
      if (courtsUsed >= numCourts) {
        stillPending.push(m)
        continue
      }
      const { teamAId: a, teamBId: b } = m
      if (usedTeamsThisSlot.has(a) || usedTeamsThisSlot.has(b)) {
        stillPending.push(m)
        continue
      }
      courtsUsed += 1
      usedTeamsThisSlot.add(a)
      usedTeamsThisSlot.add(b)
      teamLastSlot.set(a, slot)
      teamLastSlot.set(b, slot)
      results.push({ id: m.id, court: courtsUsed, slot, startTime: startTime + slot * slotLengthMs })
    }

    pending = stillPending
    slot += 1
  }

  if (pending.length > 0) {
    throw new Error('No se pudo generar el horario completo (demasiados partidos o pistas insuficientes).')
  }

  return results
}

/** Formatea una marca de tiempo (ms epoch) como hora local "HH:mm". */
export function formatMatchTime(ms) {
  if (!ms) return null
  return new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
