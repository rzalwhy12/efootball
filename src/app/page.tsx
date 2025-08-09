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

// Buat jadwal round-robin untuk N pemain: semua pasangan unik (i < j)
function makeGroupMatches(players: Player[]): Match[] {
  const ids = players.map((p) => p.id)
  const pairs: [string, string][] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push([ids[i], ids[j]])
    }
  }
  return pairs.map((pair, idx) => ({
    id: `m${idx + 1}`,
    homeId: pair[0],
    awayId: pair[1],
    homeScore: null,
    awayScore: null,
  }))
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
                      {t.groupMatches.map((m, idx) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm text-muted-foreground">{`G${idx + 1}`}</TableCell>
                          <TableCell className="font-medium">{t.playerNameById(m.homeId)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Input
                                aria-label={`Skor ${t.playerNameById(m.homeId)}`}
                                inputMode="numeric"
                                type="number"
                                min={0}
                                className="h-9 w-16 text-center"
                                value={m.homeScore ?? ""}
                                onChange={(e) => t.updateGroupScore(m.id, "home", e.target.value)}
                              />
                              <span className="text-muted-foreground">{"-"}</span>
                              <Input
                                aria-label={`Skor ${t.playerNameById(m.awayId)}`}
                                inputMode="numeric"
                                type="number"
                                min={0}
                                className="h-9 w-16 text-center"
                                value={m.awayScore ?? ""}
                                onChange={(e) => t.updateGroupScore(m.id, "away", e.target.value)}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{t.playerNameById(m.awayId)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {"Skor boleh seri pada babak grup. Poin: Menang 3, Seri 1, Kalah 0."}
                </p>
              </section>
            </CardContent>
          </Card>

          {/* Klasemen & Knockout */}
          <div className="flex flex-col gap-6">
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
