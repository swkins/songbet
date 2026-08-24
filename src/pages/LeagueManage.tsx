import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Check, X, Pencil, Star } from 'lucide-react'

type StructuredSport = 'soccer' | 'baseball' | 'basketball' | 'volleyball' | 'esports'

const SPORT_LABEL: Record<StructuredSport, string> = {
  soccer: '축구', baseball: '야구', basketball: '농구', volleyball: '배구', esports: 'LOL',
}

interface LeagueRow { name: string; is_favorite: boolean }
interface TeamRow { league: string; name: string }

export default function LeagueManage({ sport }: { sport: StructuredSport }) {
  const leaguesTable = `${sport}_leagues`
  const teamsTable = `${sport}_teams`

  const [leagues, setLeagues] = useState<LeagueRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newLeague, setNewLeague] = useState('')
  const [newTeamByLeague, setNewTeamByLeague] = useState<Record<string, string>>({})
  const [editingLeague, setEditingLeague] = useState<string | null>(null)
  const [editingLeagueValue, setEditingLeagueValue] = useState('')
  const [editingTeam, setEditingTeam] = useState<{ league: string; name: string } | null>(null)
  const [editingTeamValue, setEditingTeamValue] = useState('')

  useEffect(() => { load() }, [sport])

  async function load() {
    setLoading(true)
    const [{ data: ld }, { data: td }] = await Promise.all([
      supabase.from(leaguesTable).select('name, is_favorite').order('sort_order').order('name'),
      supabase.from(teamsTable).select('league, name').order('sort_order').order('name'),
    ])
    if (ld) setLeagues(ld as LeagueRow[])
    if (td) setTeams(td as TeamRow[])
    setLoading(false)
  }

  async function addLeague() {
    const name = newLeague.trim()
    if (!name) return
    const { error } = await supabase.from(leaguesTable).upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    if (error) { alert('리그 저장 실패: ' + error.message); return }
    setLeagues(p => p.some(l => l.name === name) ? p : [...p, { name, is_favorite: false }])
    setNewLeague('')
  }

  async function toggleFavorite(name: string) {
    const cur = leagues.find(l => l.name === name)
    const next = !cur?.is_favorite
    const { error } = await supabase.from(leaguesTable).update({ is_favorite: next }).eq('name', name)
    if (error) { alert('즐겨찾기 저장 실패: ' + error.message); return }
    setLeagues(p => p.map(l => l.name === name ? { ...l, is_favorite: next } : l))
  }

  async function renameLeague(oldName: string) {
    const name = editingLeagueValue.trim()
    if (!name || name === oldName) { setEditingLeague(null); return }
    await supabase.from(leaguesTable).upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    await supabase.from(teamsTable).update({ league: name }).eq('league', oldName)
    await supabase.from('bets').update({ league: name }).eq('league', oldName).eq('sport', sport)
    await supabase.from(leaguesTable).delete().eq('name', oldName)
    setLeagues(p => Array.from(new Map(p.map(l => l.name === oldName ? [name, { ...l, name }] : [l.name, l])).values()))
    setTeams(p => p.map(t => t.league === oldName ? { ...t, league: name } : t))
    setEditingLeague(null)
  }

  async function deleteLeague(name: string) {
    if (!confirm(`"${name}" 리그를 삭제할까요? 등록된 팀도 함께 삭제됩니다.`)) return
    await supabase.from(leaguesTable).delete().eq('name', name)
    await supabase.from('bets').update({ league: '' }).eq('league', name).eq('sport', sport)
    setLeagues(p => p.filter(l => l.name !== name))
    setTeams(p => p.filter(t => t.league !== name))
  }

  async function addTeam(league: string) {
    const name = (newTeamByLeague[league] ?? '').trim()
    if (!name) return
    const { error } = await supabase.from(teamsTable).upsert({ league, name }, { onConflict: 'league,name', ignoreDuplicates: true })
    if (error) { alert('팀 저장 실패: ' + error.message); return }
    setTeams(p => p.some(t => t.league === league && t.name === name) ? p : [...p, { league, name }])
    setNewTeamByLeague(p => ({ ...p, [league]: '' }))
  }

  async function renameTeam(league: string, oldName: string) {
    const name = editingTeamValue.trim()
    if (!name || name === oldName) { setEditingTeam(null); return }
    await supabase.from(teamsTable).update({ name }).eq('league', league).eq('name', oldName)
    setTeams(p => p.map(t => (t.league === league && t.name === oldName) ? { league, name } : t))
    setEditingTeam(null)
  }

  async function deleteTeam(league: string, name: string) {
    await supabase.from(teamsTable).delete().eq('league', league).eq('name', name)
    setTeams(p => p.filter(t => !(t.league === league && t.name === name)))
  }

  const sortedLeagues = [...leagues].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
    return a.name.localeCompare(b.name, 'ko')
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base, #0b0d12)', color: 'var(--text-primary, #eee)', padding: 16, fontFamily: 'var(--font-body, sans-serif)' }}>
      <h1 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{SPORT_LABEL[sport]} 리그 관리</h1>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        <input className="form-input" value={newLeague} onChange={e => setNewLeague(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addLeague()}
          placeholder="새 리그 이름" style={{ flex: 1, fontSize: 12, padding: '6px 8px' }} />
        <button type="button" onClick={addLeague} disabled={!newLeague.trim()}
          style={{ border: '1px solid var(--gold-border)', background: 'var(--gold-bg)', color: 'var(--gold)', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
          <Plus size={14} />
        </button>
      </div>

      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>불러오는 중...</div>}
      {!loading && sortedLeagues.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>등록된 리그 없음</div>}

      {sortedLeagues.map(l => (
        <div key={l.name} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <button type="button" onClick={() => toggleFavorite(l.name)}
              style={{ border: 'none', background: 'none', color: l.is_favorite ? 'var(--gold)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
              <Star size={12} fill={l.is_favorite ? 'currentColor' : 'none'} />
            </button>
            {editingLeague === l.name ? (
              <>
                <input autoFocus className="form-input" value={editingLeagueValue} onChange={e => setEditingLeagueValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && renameLeague(l.name)}
                  style={{ flex: 1, fontSize: 12, padding: '4px 6px' }} />
                <button type="button" onClick={() => renameLeague(l.name)} style={{ border: 'none', background: 'none', color: 'var(--green)', cursor: 'pointer', display: 'flex', padding: 2 }}><Check size={13} /></button>
                <button type="button" onClick={() => setEditingLeague(null)} style={{ border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={13} /></button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>{l.name}</span>
                <button type="button" onClick={() => { setEditingLeague(l.name); setEditingLeagueValue(l.name) }}
                  style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}><Pencil size={12} /></button>
                <button type="button" onClick={() => deleteLeague(l.name)}
                  style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', display: 'flex', padding: 2 }}><Trash2 size={12} /></button>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {teams.filter(t => t.league === l.name).map(t => (
              editingTeam && editingTeam.league === l.name && editingTeam.name === t.name ? (
                <div key={t.name} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <input autoFocus className="form-input" value={editingTeamValue} onChange={e => setEditingTeamValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && renameTeam(l.name, t.name)}
                    style={{ fontSize: 11, padding: '2px 5px', width: 90 }} />
                  <button type="button" onClick={() => renameTeam(l.name, t.name)} style={{ border: 'none', background: 'none', color: 'var(--green)', cursor: 'pointer', display: 'flex', padding: 1 }}><Check size={11} /></button>
                  <button type="button" onClick={() => setEditingTeam(null)} style={{ border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: 1 }}><X size={11} /></button>
                </div>
              ) : (
                <span key={t.name} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 6px' }}>
                  {t.name}
                  <button type="button" onClick={() => { setEditingTeam({ league: l.name, name: t.name }); setEditingTeamValue(t.name) }}
                    style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}><Pencil size={9} /></button>
                  <button type="button" onClick={() => deleteTeam(l.name, t.name)}
                    style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}><X size={9} /></button>
                </span>
              )
            ))}
            {teams.filter(t => t.league === l.name).length === 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>등록된 팀 없음</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <input className="form-input" value={newTeamByLeague[l.name] ?? ''}
              onChange={e => setNewTeamByLeague(p => ({ ...p, [l.name]: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addTeam(l.name)}
              placeholder="새 팀 이름" style={{ flex: 1, fontSize: 11, padding: '4px 6px' }} />
            <button type="button" onClick={() => addTeam(l.name)} disabled={!(newTeamByLeague[l.name] ?? '').trim()}
              style={{ border: '1px solid var(--gold-border)', background: 'var(--gold-bg)', color: 'var(--gold)', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
              <Plus size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
