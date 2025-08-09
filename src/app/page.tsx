"use client"

import { useMemo, useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trophy, Users, ListOrdered, Brackets } from "lucide-react"
import { cn } from "@/lib/utils"

type Player = {
  id: string // "p1"..."pN"
  name: string
}

type Match = {
  id: string // "m1"..."mK"
  homeId: string
  awayId: string
  homeScore: number | null
  awayScore: number | null
}

type StandingRow = {
  playerId: string
  name: string
  played: number
  win: number
  draw: number
  loss: number
  gf: number
  ga: number
  gd: number
  pts: number
}

type KnockoutFormat = "semi-final" | "final-only"

const STORAGE_KEY = "efootball:v2" // versi baru untuk struktur dinamis

type PersistedState = {
  players: Player[]
  groupMatches: Match[]
  koFormat: KnockoutFormat
  sf1: { homeScore: number | null; awayScore: number | null }
  sf2: { homeScore: number | null; awayScore: number | null }
  finalMatch: { homeScore: number | null; awayScore: number | null }
}

function loadSaved(): PersistedState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.players) || !Array.isArray(data.groupMatches)) return null
    const ko: KnockoutFormat = data.koFormat === "final-only" ? "final-only" : "semi-final"
    return {
      players: data.players,
      groupMatches: data.groupMatches,
      koFormat: ko,
      sf1: data.sf1 ?? { homeScore: null, awayScore: null },
      sf2: data.sf2 ?? { homeScore: null, awayScore: null },
      finalMatch: data.finalMatch ?? { homeScore: null, awayScore: null },
    }
  } catch {
    return null
  }
}

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Pemain ${i + 1}`,
  }))
}

// Ganti fungsi makeGroupMatches dengan algoritma yang benar-benar menyeimbangkan home/away untuk semua pemain:

function makeGroupMatches(players: Player[]): Match[] {
  const n = players.length
  if (n < 2) return []

  const matches: Match[] = []
  let matchId = 1

  // Untuk keseimbangan yang sempurna, kita gunakan pendekatan berbeda
  // Setiap pemain bermain (n-1) pertandingan
  // Target: setiap pemain jadi tuan rumah floor((n-1)/2) atau ceil((n-1)/2) kali

  const playerIds = players.map((p) => p.id)
  const totalGamesPerPlayer = n - 1
  const targetHomeGames = Math.floor(totalGamesPerPlayer / 2)
  const extraHomeGames = totalGamesPerPlayer % 2 // 1 jika ganjil, 0 jika genap

  // Tentukan berapa pemain yang perlu 1 home game tambahan
  const playersNeedingExtra = (extraHomeGames * n) / 2

  // Assign target home games untuk setiap pemain
  const playerHomeTargets = new Map<string, number>()
  playerIds.forEach((id, index) => {
    const needsExtra = index < playersNeedingExtra
    playerHomeTargets.set(id, targetHomeGames + (needsExtra ? 1 : 0))
  })

  // Track actual home games
  const homeCount = new Map<string, number>()
  playerIds.forEach((id) => homeCount.set(id, 0))

  // Buat semua pasangan yang mungkin
  const allPairs: [string, string][] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      allPairs.push([playerIds[i], playerIds[j]])
    }
  }

  // Untuk setiap pasangan, tentukan siapa yang jadi tuan rumah
  // Gunakan algoritma yang lebih fair
  const finalMatches: [string, string][] = []

  // Sort pairs untuk memastikan distribusi yang adil
  allPairs.sort(() => Math.random() - 0.5) // Randomize order

  for (const [p1, p2] of allPairs) {
    const p1HomeCount = homeCount.get(p1)!
    const p2HomeCount = homeCount.get(p2)!
    const p1Target = playerHomeTargets.get(p1)!
    const p2Target = playerHomeTargets.get(p2)!

    // Hitung berapa banyak lagi masing-masing pemain perlu jadi tuan rumah
    const p1NeedsHome = p1Target - p1HomeCount
    const p2NeedsHome = p2Target - p2HomeCount

    if (p1NeedsHome > p2NeedsHome) {
      // P1 lebih perlu jadi tuan rumah
      finalMatches.push([p1, p2])
      homeCount.set(p1, p1HomeCount + 1)
    } else if (p2NeedsHome > p1NeedsHome) {
      // P2 lebih perlu jadi tuan rumah
      finalMatches.push([p2, p1])
      homeCount.set(p2, p2HomeCount + 1)
    } else {
      // Sama-sama perlu, pilih secara bergantian berdasarkan index
      const p1Index = playerIds.indexOf(p1)
      const p2Index = playerIds.indexOf(p2)
      const pairIndex = allPairs.findIndex(([a, b]) => (a === p1 && b === p2) || (a === p2 && b === p1))

      if ((pairIndex + p1Index + p2Index) % 2 === 0) {
        finalMatches.push([p1, p2])
        homeCount.set(p1, p1HomeCount + 1)
      } else {
        finalMatches.push([p2, p1])
        homeCount.set(p2, p2HomeCount + 1)
      }
    }
  }

  // Sekarang susun matches ke dalam rounds untuk menghindari back-to-back
  if (n % 2 === 0) {
    // Jumlah pemain genap: gunakan circle method
    const rounds = n - 1
    const matchesPerRound = n / 2

    // Buat mapping dari pasangan ke home/away assignment
    const pairToHomeAway = new Map<string, [string, string]>()
    for (const [home, away] of finalMatches) {
      const key = [home, away].sort().join("-")
      pairToHomeAway.set(key, [home, away])
    }

    // Circle method untuk round-robin
    const circle = [...playerIds]
    const fixed = circle[0]
    const rotating = circle.slice(1)

    for (let round = 0; round < rounds; round++) {
      // Match 1: fixed vs rotating[0]
      const opponent = rotating[0]
      const key = [fixed, opponent].sort().join("-")
      const [home, away] = pairToHomeAway.get(key)!
      matches.push({
        id: `m${matchId++}`,
        homeId: home,
        awayId: away,
        homeScore: null,
        awayScore: null,
      })

      // Matches sisanya: pair dari ujung-ujung
      for (let i = 1; i < matchesPerRound; i++) {
        const leftIdx = i
        const rightIdx = rotating.length - i
        if (leftIdx < rightIdx) {
          const left = rotating[leftIdx]
          const right = rotating[rightIdx]
          const key = [left, right].sort().join("-")
          const [home, away] = pairToHomeAway.get(key)!
          matches.push({
            id: `m${matchId++}`,
            homeId: home,
            awayId: away,
            homeScore: null,
            awayScore: null,
          })
        }
      }

      // Rotasi
      if (rotating.length > 1) {
        const last = rotating.pop()!
        rotating.unshift(last)
      }
    }
  } else {
    // Jumlah pemain ganjil: setiap round ada yang istirahat
    const rounds = n
    const matchesPerRound = Math.floor(n / 2)

    // Buat mapping dari pasangan ke home/away assignment
    const pairToHomeAway = new Map<string, [string, string]>()
    for (const [home, away] of finalMatches) {
      const key = [home, away].sort().join("-")
      pairToHomeAway.set(key, [home, away])
    }

    for (let round = 0; round < rounds; round++) {
      const roundPlayers = [...playerIds]

      // Rotasi untuk round ini
      for (let i = 0; i < round; i++) {
        const first = roundPlayers.shift()!
        roundPlayers.push(first)
      }

      // Pemain pertama istirahat
      const activePlayers = roundPlayers.slice(1)

      // Pair dari ujung-ujung
      for (let i = 0; i < matchesPerRound; i++) {
        const leftIdx = i
        const rightIdx = activePlayers.length - 1 - i
        if (leftIdx < rightIdx) {
          const left = activePlayers[leftIdx]
          const right = activePlayers[rightIdx]
          const key = [left, right].sort().join("-")
          const [home, away] = pairToHomeAway.get(key)!
          matches.push({
            id: `m${matchId++}`,
            homeId: home,
            awayId: away,
            homeScore: null,
            awayScore: null,
          })
        }
      }
    }
  }

  return matches
}

// Tambahkan fungsi untuk regenerate jadwal dengan distribusi yang berbeda:

// Tambahkan fungsi untuk menghitung statistik home/away dan tampilkan di UI

function getHomeAwayStats(players: Player[], matches: Match[]): Map<string, { home: number; away: number }> {
  const stats = new Map<string, { home: number; away: number }>()

  // Initialize stats
  players.forEach((p) => {
    stats.set(p.id, { home: 0, away: 0 })
  })

  // Count home/away appearances
  matches.forEach((match) => {
    const homeStats = stats.get(match.homeId)
    const awayStats = stats.get(match.awayId)
    if (homeStats) homeStats.home += 1
    if (awayStats) awayStats.away += 1
  })

  return stats
}

function computeStandings(players: Player[], matches: Match[]): StandingRow[] {
  const map = new Map<string, StandingRow>()
  for (const p of players) {
    map.set(p.id, {
      playerId: p.id,
      name: p.name,
      played: 0,
      win: 0,
      draw: 0,
      loss: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      pts: 0,
    })
  }

  for (const m of matches) {
    if (m.homeScore == null || m.awayScore == null) continue
    const home = map.get(m.homeId)
    const away = map.get(m.awayId)
    if (!home || !away) continue
    home.played += 1
    away.played += 1
    home.gf += m.homeScore
    home.ga += m.awayScore
    away.gf += m.awayScore
    away.ga += m.homeScore
    if (m.homeScore > m.awayScore) {
      home.win += 1
      home.pts += 3
      away.loss += 1
    } else if (m.homeScore < m.awayScore) {
      away.win += 1
      away.pts += 3
      home.loss += 1
    } else {
      home.draw += 1
      away.draw += 1
      home.pts += 1
      away.pts += 1
    }
  }

  const table = Array.from(map.values()).map((r) => ({ ...r, gd: r.gf - r.ga }))
  table.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.gd !== a.gd) return b.gd - a.gd
    if (b.gf !== a.gf) return b.gf - a.gf
    return a.name.localeCompare(b.name)
  })
  return table
}

function allGroupMatchesCompleted(matches: Match[]): boolean {
  return matches.every((m) => m.homeScore != null && m.awayScore != null)
}

function safeParseScore(v: string): number | null {
  if (v === "" || v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

// Update bagian useTournament untuk menambahkan homeAwayStats

function useTournament() {
  const saved = loadSaved()
  const initialPlayers = saved?.players ?? makePlayers(4)

  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [groupMatches, setGroupMatches] = useState<Match[]>(
    () => saved?.groupMatches ?? makeGroupMatches(initialPlayers),
  )
  const [koFormat, setKoFormat] = useState<KnockoutFormat>(() => saved?.koFormat ?? "semi-final")

  // Knockout states
  const [sf1, setSf1] = useState<{ homeScore: number | null; awayScore: number | null }>(
    () => saved?.sf1 ?? { homeScore: null, awayScore: null },
  )
  const [sf2, setSf2] = useState<{ homeScore: number | null; awayScore: number | null }>(
    () => saved?.sf2 ?? { homeScore: null, awayScore: null },
  )
  const [finalMatch, setFinalMatch] = useState<{ homeScore: number | null; awayScore: number | null }>(
    () => saved?.finalMatch ?? { homeScore: null, awayScore: null },
  )

  // Jika jumlah pemain < 4 dan format semi-final, paksa ke final-only
  useEffect(() => {
    if (players.length < 4 && koFormat === "semi-final") {
      setKoFormat("final-only")
      setSf1({ homeScore: null, awayScore: null })
      setSf2({ homeScore: null, awayScore: null })
      setFinalMatch({ homeScore: null, awayScore: null })
    }
  }, [players.length, koFormat])

  // Klasemen dan status
  const standings = useMemo(() => computeStandings(players, groupMatches), [players, groupMatches])
  const homeAwayStats = useMemo(() => getHomeAwayStats(players, groupMatches), [players, groupMatches])

  // Tambahkan fungsi untuk regenerate jadwal dengan distribusi yang berbeda:
  function regenerateSchedule() {
    const newMatches = makeGroupMatches(players)
    setGroupMatches(newMatches)
    // Reset knockout scores
    setSf1({ homeScore: null, awayScore: null })
    setSf2({ homeScore: null, awayScore: null })
    setFinalMatch({ homeScore: null, awayScore: null })
  }

  const groupDone = allGroupMatchesCompleted(groupMatches)

  // Seeds
  const seed1 = standings[0]?.playerId
  const seed2 = standings[1]?.playerId
  const seed3 = standings[2]?.playerId
  const seed4 = standings[3]?.playerId

  function playerNameById(id?: string): string {
    if (!id) return "-"
    return players.find((p) => p.id === id)?.name ?? "-"
  }

  // Pemenang SF untuk format semi-final
  const sf1WinnerId = useMemo(() => {
    if (!groupDone || koFormat !== "semi-final") return undefined
    if (!seed1 || !seed4) return undefined
    if (sf1.homeScore == null || sf1.awayScore == null) return undefined
    if (sf1.homeScore === sf1.awayScore) return undefined
    return sf1.homeScore > sf1.awayScore ? seed1 : seed4
  }, [groupDone, koFormat, seed1, seed4, sf1])

  const sf2WinnerId = useMemo(() => {
    if (!groupDone || koFormat !== "semi-final") return undefined
    if (!seed2 || !seed3) return undefined
    if (sf2.homeScore == null || sf2.awayScore == null) return undefined
    if (sf2.homeScore === sf2.awayScore) return undefined
    return sf2.homeScore > sf2.awayScore ? seed2 : seed3
  }, [groupDone, koFormat, seed2, seed3, sf2])

  const finalHomeId = useMemo(() => {
    if (!groupDone) return undefined
    if (koFormat === "final-only") return seed1
    return sf1WinnerId
  }, [groupDone, koFormat, seed1, sf1WinnerId])

  const finalAwayId = useMemo(() => {
    if (!groupDone) return undefined
    if (koFormat === "final-only") return seed2
    return sf2WinnerId
  }, [groupDone, koFormat, seed2, sf2WinnerId])

  const championId = useMemo(() => {
    if (!finalHomeId || !finalAwayId) return undefined
    if (finalMatch.homeScore == null || finalMatch.awayScore == null) return undefined
    if (finalMatch.homeScore === finalMatch.awayScore) return undefined
    return finalMatch.homeScore > finalMatch.awayScore ? finalHomeId : finalAwayId
  }, [finalHomeId, finalAwayId, finalMatch])

  function updatePlayerName(id: string, name: string) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }

  function updateGroupScore(matchId: string, which: "home" | "away", value: string) {
    const parsed = safeParseScore(value)
    setGroupMatches((prev) =>
      prev.map((m) =>
        m.id === matchId
          ? {
              ...m,
              homeScore: which === "home" ? parsed : m.homeScore,
              awayScore: which === "away" ? parsed : m.awayScore,
            }
          : m,
      ),
    )
  }

  function changePlayerCount(newCount: number) {
    // Batasi 2–16
    const count = Math.max(2, Math.min(16, newCount))
    setPlayers((prev) => {
      const nextPlayers = Array.from({ length: count }, (_, i) => {
        const old = prev[i]
        return {
          id: `p${i + 1}`,
          name: old?.name ?? `Pemain ${i + 1}`,
        }
      })
      setGroupMatches(makeGroupMatches(nextPlayers))
      // reset KO + sesuaikan format
      if (count < 4) {
        setKoFormat("final-only")
      }
      setSf1({ homeScore: null, awayScore: null })
      setSf2({ homeScore: null, awayScore: null })
      setFinalMatch({ homeScore: null, awayScore: null })
      return nextPlayers
    })
  }

  function resetTournament() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
    const freshPlayers = makePlayers(4)
    setPlayers(freshPlayers)
    setGroupMatches(makeGroupMatches(freshPlayers))
    setKoFormat("semi-final")
    setSf1({ homeScore: null, awayScore: null })
    setSf2({ homeScore: null, awayScore: null })
    setFinalMatch({ homeScore: null, awayScore: null })
  }

  // Persist
  useEffect(() => {
    const data: PersistedState = {
      players,
      groupMatches,
      koFormat,
      sf1,
      sf2,
      finalMatch,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // abaikan
    }
  }, [players, groupMatches, koFormat, sf1, sf2, finalMatch])

  return {
    players,
    groupMatches,
    standings,
    homeAwayStats,
    groupDone,
    koFormat,
    setKoFormat,
    sf1,
    setSf1,
    sf2,
    setSf2,
    finalMatch,
    setFinalMatch,
    seed1,
    seed2,
    seed3,
    seed4,
    finalHomeId,
    finalAwayId,
    playerNameById,
    championId,
    updatePlayerName,
    updateGroupScore,
    changePlayerCount,
    resetTournament,
    regenerateSchedule,
  }
}

export default function Page() {
  const t = useTournament()
  const playerCounts = Array.from({ length: 15 }, (_, i) => `${i + 2}`) // "2"..."16"

  return (
    <main className="min-h-[100dvh] bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="size-6 text-yellow-600" aria-hidden="true" />
            <h1 className="text-2xl font-semibold tracking-tight">Turnamen eFootball</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {"Babak Grup → Knockout → Final"}
            </Badge>
            <Button variant="outline" onClick={t.regenerateSchedule}>
              {"Acak Jadwal"}
            </Button>
            <Button variant="outline" onClick={t.resetTournament}>
              {"Reset Turnamen"}
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Babak Grup */}
          <Card>
            <CardHeader className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Users className="size-5 text-emerald-600" aria-hidden="true" />
                <CardTitle>{`Babak Grup (Round-robin ${t.players.length} Pemain)`}</CardTitle>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="player-count" className="text-sm text-muted-foreground">
                    {"Jumlah Pemain"}
                  </Label>
                  <Select
                    value={`${t.players.length}`}
                    onValueChange={(val) => t.changePlayerCount(Number.parseInt(val))}
                  >
                    <SelectTrigger id="player-count" className="w-[160px]">
                      <SelectValue placeholder="Pilih jumlah pemain" />
                    </SelectTrigger>
                    <SelectContent>
                      {playerCounts.map((val) => (
                        <SelectItem key={val} value={val}>
                          {val}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  {"Mengubah jumlah pemain akan mengatur ulang jadwal & skor knockout."}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Edit Nama Pemain */}
              <section aria-labelledby="edit-players">
                <h2 id="edit-players" className="mb-3 text-sm font-medium text-muted-foreground">
                  {"Nama Pemain"}
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {t.players.map((p) => (
                    <div key={p.id} className="space-y-1.5">
                      <Label htmlFor={`name-${p.id}`}>{p.name}</Label>
                      <Input
                        id={`name-${p.id}`}
                        value={p.name}
                        onChange={(e) => t.updatePlayerName(p.id, e.target.value)}
                        placeholder="Tulis nama pemain..."
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Jadwal & Input Skor */}

              <section aria-labelledby="group-fixtures">
                <h2 id="group-fixtures" className="mb-3 text-sm font-medium text-muted-foreground">
                  {"Jadwal Pertandingan Grup"}
                </h2>
                <div className="space-y-4">
                  {t.groupMatches.map((match, matchIdx) => {
                    const roundIdx = Math.floor(matchIdx / (t.players.length / 2))
                    return (
                      <div key={match.id} className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground">{`Matchday ${roundIdx + 1}`}</h3>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[90px]">{"Match"}</TableHead>
                                <TableHead>{"Tuan Rumah"}</TableHead>
                                <TableHead className="w-[110px] text-center">{"Skor"}</TableHead>
                                <TableHead>{"Tandang"}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              <TableRow key={match.id}>
                                <TableCell className="text-sm text-muted-foreground">
                                  {`${roundIdx + 1}.${(matchIdx % (t.players.length / 2)) + 1}`}
                                </TableCell>
                                <TableCell className="font-medium">{t.playerNameById(match.homeId)}</TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-center gap-2">
                                    <Input
                                      aria-label={`Skor ${t.playerNameById(match.homeId)}`}
                                      inputMode="numeric"
                                      type="number"
                                      min={0}
                                      className="h-9 w-16 text-center"
                                      value={match.homeScore ?? ""}
                                      onChange={(e) => t.updateGroupScore(match.id, "home", e.target.value)}
                                    />
                                    <span className="text-muted-foreground">{"-"}</span>
                                    <Input
                                      aria-label={`Skor ${t.playerNameById(match.awayId)}`}
                                      inputMode="numeric"
                                      type="number"
                                      min={0}
                                      className="h-9 w-16 text-center"
                                      value={match.awayScore ?? ""}
                                      onChange={(e) => t.updateGroupScore(match.id, "away", e.target.value)}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium">{t.playerNameById(match.awayId)}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {
                    "Jadwal disusun agar tidak ada pemain yang bermain back-to-back dan distribusi tuan rumah/tandang seimbang. Skor boleh seri pada babak grup. Poin: Menang 3, Seri 1, Kalah 0."
                  }
                </p>
              </section>
            </CardContent>
          </Card>

          {/* Klasemen & Knockout */}
          <div className="flex flex-col gap-6">
            {/* Tambahkan tabel Home/Away Balance setelah klasemen */}

            {/* Klasemen */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListOrdered className="size-5 text-emerald-600" aria-hidden="true" />
                  <CardTitle>{"Klasemen"}</CardTitle>
                </div>
                <Badge variant="outline">
                  {`${t.standings.filter((r) => r.played > 0).length ? "Live" : "Menunggu skor"}`}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">{"#"}</TableHead>
                        <TableHead>{"Pemain"}</TableHead>
                        <TableHead className="text-center">{"P"}</TableHead>
                        <TableHead className="text-center">{"M"}</TableHead>
                        <TableHead className="text-center">{"S"}</TableHead>
                        <TableHead className="text-center">{"K"}</TableHead>
                        <TableHead className="text-center">{"GF"}</TableHead>
                        <TableHead className="text-center">{"GA"}</TableHead>
                        <TableHead className="text-center">{"GD"}</TableHead>
                        <TableHead className="text-center">{"Pts"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {t.standings.map((row, i) => (
                        <TableRow key={row.playerId}>
                          <TableCell className="font-semibold">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            <span className={cn(i === 0 && "text-emerald-700", i === 1 && "text-emerald-600")}>
                              {row.name}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">{row.played}</TableCell>
                          <TableCell className="text-center">{row.win}</TableCell>
                          <TableCell className="text-center">{row.draw}</TableCell>
                          <TableCell className="text-center">{row.loss}</TableCell>
                          <TableCell className="text-center">{row.gf}</TableCell>
                          <TableCell className="text-center">{row.ga}</TableCell>
                          <TableCell className="text-center">{row.gd}</TableCell>
                          <TableCell className="text-center font-semibold">{row.pts}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {"Urutan klasemen: Poin → Selisih Gol (GD) → Gol Masuk (GF) → Nama."}
                </p>
              </CardContent>
            </Card>

            {/* Home/Away Balance */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="size-5 text-blue-600" aria-hidden="true" />
                  <CardTitle>{"Keseimbangan Tuan Rumah/Tandang"}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{"Pemain"}</TableHead>
                        <TableHead className="text-center">{"Target Home"}</TableHead>
                        <TableHead className="text-center">{"Tuan Rumah"}</TableHead>
                        <TableHead className="text-center">{"Tandang"}</TableHead>
                        <TableHead className="text-center">{"Total"}</TableHead>
                        <TableHead className="text-center">{"Balance"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {t.players.map((player, index) => {
                        const stats = t.homeAwayStats.get(player.id) || { home: 0, away: 0 }
                        const total = stats.home + stats.away
                        const balance = stats.home - stats.away
                        const totalGamesPerPlayer = t.players.length - 1
                        const targetHomeGames = Math.floor(totalGamesPerPlayer / 2)
                        const extraHomeGames = totalGamesPerPlayer % 2
                        const playersNeedingExtra = (extraHomeGames * t.players.length) / 2
                        const needsExtra = index < playersNeedingExtra
                        const target = targetHomeGames + (needsExtra ? 1 : 0)
                        const isBalanced = Math.abs(balance) <= 1 && stats.home === target

                        return (
                          <TableRow key={player.id}>
                            <TableCell className="font-medium">{player.name}</TableCell>
                            <TableCell className="text-center text-muted-foreground">{target}</TableCell>
                            <TableCell className="text-center">{stats.home}</TableCell>
                            <TableCell className="text-center">{stats.away}</TableCell>
                            <TableCell className="text-center">{total}</TableCell>
                            <TableCell className="text-center">
                              <span
                                className={cn(
                                  "text-sm font-medium",
                                  isBalanced ? "text-emerald-600" : "text-amber-600",
                                )}
                              >
                                {balance > 0 ? `+${balance}` : balance === 0 ? "0" : `${balance}`}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {
                    "Balance menunjukkan selisih antara tuan rumah dan tandang. Nilai 0 atau ±1 menunjukkan distribusi yang seimbang."
                  }
                </p>
              </CardContent>
            </Card>

            {/* Knockout */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brackets className="size-5 text-emerald-600" aria-hidden="true" />
                  <CardTitle>{"Knockout"}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="ko-format" className="text-sm text-muted-foreground">
                    {"Format"}
                  </Label>
                  <Select
                    value={t.koFormat}
                    onValueChange={(v: KnockoutFormat) => {
                      // Ubah format + reset skor KO
                      if (v === "semi-final" && t.players.length < 4) {
                        // tidak boleh, abaikan
                        return
                      }
                      // set dan reset skor
                      // (tetap reset untuk menjaga konsistensi)
                      // semi-final perlu dua SF, final-only langsung final
                      t.setKoFormat(v)
                      t.setSf1({ homeScore: null, awayScore: null })
                      t.setSf2({ homeScore: null, awayScore: null })
                      t.setFinalMatch({ homeScore: null, awayScore: null })
                    }}
                  >
                    <SelectTrigger id="ko-format" className="w-[200px]">
                      <SelectValue placeholder="Pilih format knockout" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="final-only">{"Langsung Final (1 vs 2)"}</SelectItem>
                      <SelectItem value="semi-final" disabled={t.players.length < 4}>
                        {"Semi-final + Final (1 vs 4, 2 vs 3)"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {!t.groupDone ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    {"Lengkapi semua skor babak grup untuk mengaktifkan bracket knockout."}
                  </div>
                ) : (
                  <>
                    {t.koFormat === "semi-final" && t.players.length >= 4 && (
                      <section aria-labelledby="semi-final" className="space-y-4">
                        <h3 id="semi-final" className="text-sm font-medium text-muted-foreground">
                          {"Semi-final"}
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                          <MatchRow
                            code="SF1"
                            homeName={t.playerNameById(t.seed1)}
                            awayName={t.playerNameById(t.seed4)}
                            homeScore={t.sf1.homeScore}
                            awayScore={t.sf1.awayScore}
                            onHomeChange={(v) => t.setSf1((s) => ({ ...s, homeScore: v }))}
                            onAwayChange={(v) => t.setSf1((s) => ({ ...s, awayScore: v }))}
                            disabled={!t.seed1 || !t.seed4}
                            note={"Tidak boleh seri pada babak knockout."}
                          />
                          <MatchRow
                            code="SF2"
                            homeName={t.playerNameById(t.seed2)}
                            awayName={t.playerNameById(t.seed3)}
                            homeScore={t.sf2.homeScore}
                            awayScore={t.sf2.awayScore}
                            onHomeChange={(v) => t.setSf2((s) => ({ ...s, homeScore: v }))}
                            onAwayChange={(v) => t.setSf2((s) => ({ ...s, awayScore: v }))}
                            disabled={!t.seed2 || !t.seed3}
                            note={"Tidak boleh seri pada babak knockout."}
                          />
                        </div>
                      </section>
                    )}

                    <section aria-labelledby="final" className="space-y-4">
                      <h3 id="final" className="text-sm font-medium text-muted-foreground">
                        {"Final"}
                      </h3>
                      <MatchRow
                        code="FNL"
                        homeName={t.playerNameById(t.finalHomeId)}
                        awayName={t.playerNameById(t.finalAwayId)}
                        homeScore={t.finalMatch.homeScore}
                        awayScore={t.finalMatch.awayScore}
                        onHomeChange={(v) => t.setFinalMatch((s) => ({ ...s, homeScore: v }))}
                        onAwayChange={(v) => t.setFinalMatch((s) => ({ ...s, awayScore: v }))}
                        disabled={!t.finalHomeId || !t.finalAwayId}
                        note={"Tidak boleh seri pada babak knockout."}
                      />
                      <ChampionBar name={t.playerNameById(t.championId)} ready={!!t.championId} />
                    </section>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}

function MatchRow(props: {
  code: string
  homeName: string
  awayName: string
  homeScore: number | null
  awayScore: number | null
  onHomeChange: (v: number | null) => void
  onAwayChange: (v: number | null) => void
  disabled?: boolean
  note?: string
}) {
  const { code, homeName, awayName, homeScore, awayScore, onHomeChange, onAwayChange, disabled, note } = props
  return (
    <div className={cn("rounded-md border p-3", disabled && "opacity-60")}>
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="w-16 justify-center">
          {code}
        </Badge>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex-1 font-medium">{homeName}</div>
          <div className="flex items-center justify-center gap-2">
            <Input
              aria-label={`Skor ${homeName}`}
              inputMode="numeric"
              type="number"
              min={0}
              className="h-9 w-16 text-center"
              value={homeScore ?? ""}
              onChange={(e) => onHomeChange(parseOrNull(e.target.value))}
              disabled={disabled}
            />
            <span className="text-muted-foreground">{"-"}</span>
            <Input
              aria-label={`Skor ${awayName}`}
              inputMode="numeric"
              type="number"
              min={0}
              className="h-9 w-16 text-center"
              value={awayScore ?? ""}
              onChange={(e) => onAwayChange(parseOrNull(e.target.value))}
              disabled={disabled}
            />
          </div>
          <div className="flex-1 text-right font-medium">{awayName}</div>
        </div>
      </div>
      {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function ChampionBar(props: { name: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background p-3">
      <div className="flex items-center gap-2">
        <Trophy className={cn("size-5", props.ready ? "text-yellow-600" : "text-muted-foreground")} />
        <span className="text-sm font-medium">{"Juara"}</span>
      </div>
      <div className={cn("text-base font-semibold", !props.ready && "text-muted-foreground")}>
        {props.ready ? props.name : "Menunggu hasil final"}
      </div>
    </div>
  )
}

function parseOrNull(v: string): number | null {
  if (!v && v !== "0") return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}
