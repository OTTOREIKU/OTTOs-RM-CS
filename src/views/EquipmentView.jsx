import React, { useState, useMemo } from 'react'
import { useCharacter } from '../store/CharacterContext.jsx'
import talentsData from '../data/talents.json'
import skillsData from '../data/skills.json'
import weaponsData from '../data/weapons.json'
import armorData from '../data/armor.json'
import { getWeaponOB } from '../utils/calc.js'
import { XIcon, ChevronDownIcon, ChevronRightIcon, ArrowDownIcon } from '../components/Icons.jsx'

const LOCATIONS = ['Carried', 'Pack', 'Belt', 'Worn', 'Stored', 'Mount']
const STATS = ['Agility','Constitution','Empathy','Intuition','Memory','Presence','Quickness','Reasoning','Self Discipline','Strength']
const ELEMENTS = ['Cold/Ice','Heat/Fire','Electricity/Light']
const REALMS = ['Channeling','Essence','Mentalism']
const SENSES = ['Taste','Touch','Smell','Hearing','Sight']
const ALL_SKILL_NAMES = [...new Set(skillsData.map(s => s.name))].sort()

function resolveSkillName(templateName, label) {
  if (!label) return templateName
  if (/<[^>]+>/.test(templateName)) return templateName.replace(/<[^>]+>/, label)
  return `${templateName}: ${label}`
}
const CATEGORIES = ['All','Combat','Discipline','Magical','Physical','Racial','Senses','Other']
const CAT_COLOR = {
  Combat:'var(--danger)',Discipline:'var(--purple)',Magical:'var(--accent)',
  Physical:'var(--success)',Racial:'#e67e22',Senses:'#1abc9c',Other:'var(--text3)',
}
const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X']

// Weapon skill categories for filtering
const W_SKILL_CATS = ['All','Blade','Greater Blade','Hafted','Greater Hafted','Pole Arm','Spear','Chain','Greater Chain','Net','Bow','Crossbow','Thrown','Sling','Blowpipe','Shield','Strikes','Grappling/Wrestling']
const W_OB_TYPES   = ['All','melee','ranged','unarmed']
const W_SKILL_COLOR = {
  'Blade':'#3b82f6','Greater Blade':'#60a5fa','Hafted':'#f97316','Greater Hafted':'#fb923c',
  'Pole Arm':'#22c55e','Spear':'#86efac','Chain':'#a855f7','Greater Chain':'#c084fc',
  'Net':'#14b8a6','Bow':'#f59e0b','Crossbow':'#fbbf24','Thrown':'#ef4444',
  'Sling':'#f87171','Blowpipe':'#84cc16','Shield':'#6b7280',
  'Strikes':'#ec4899','Grappling/Wrestling':'#8b5cf6',
}

// Common equipment items: [name, weight]
const COMMON_ITEMS = [
  ['Backpack',2],['Belt Pouch',0.1],['Bedroll',3],['Blanket',2],['Tent (2-person)',6],
  ['Rope, 50ft',5],['Rope, 100ft',10],['Grappling Hook',3],
  ['Torch',0.5],['Lantern',1],['Oil Flask',0.5],['Candle',0.1],
  ['Flint & Steel',0],['Rations (1 day)',1],['Waterskin (full)',4],
  ['Parchment (sheet)',0],['Quill & Ink',0],['Whetstone',0.5],
  ['Rope & Pulley',4],['Crowbar',3],['Hammer',1],['Piton',0.1],
  ['Mirror, small',0],['Chalk',0],['Soap',0],['Bandages',0.1],
  ['Healing Herb',0],['Antidote',0],['Poison',0],
]

function tierCost(def, tier, param) {
  // param_costs: variable cost based on chosen param (e.g. Missing Sense varies by sense)
  if (def.param_costs && param && def.param_costs[param] != null) return def.param_costs[param]
  if (def.tier_costs) return def.tier_costs[tier - 1] ?? null
  if (def.cost_tier1 != null && tier === 1) return def.cost_tier1
  if (def.cost_tier1 != null) return def.cost_tier1 + (tier - 1) * Math.abs(def.cost_per_tier) * (def.is_flaw ? -1 : 1)
  return def.cost_per_tier * tier
}

function effectSummary(def, inst) {
  const parts = []
  const seen = new Set()
  for (const eff of (def.effects || [])) {
    const val = eff.per_tier != null ? eff.per_tier * inst.tier : (eff.flat ?? 0)
    if (!val) continue
    const s = val > 0 ? `+${val}` : String(val)
    switch (eff.type) {
      case 'skill_talent_bonus': {
        const skills = eff.skill === 'param'
          ? [inst.param, ...(inst.extra_params || [])].filter(Boolean)
          : (eff.skill ? [eff.skill] : [])
        if (skills.length === 1) parts.push(s + ' to ' + skills[0])
        else if (skills.length > 1) parts.push(s + ' to ' + skills[0] + ` (+${skills.length - 1} more)`)
        break
      }
      case 'spellcasting_bonus': parts.push(s + ' Spellcasting'); break
      case 'db_bonus':           parts.push(s + ' DB'); break
      case 'hits_bonus':         parts.push(s + ' base hits'); break
      case 'initiative_bonus':   parts.push(s + ' Initiative'); break
      case 'endurance_bonus':    parts.push(s + ' Endurance rolls'); break
      case 'rr_bonus': {
        const realm = eff.realm === 'param' ? (inst.param || 'realm') : eff.realm
        const key = `rr_${realm}`
        if (!seen.has(key)) { seen.add(key); parts.push(s + ' ' + realm + ' RR') }
        break
      }
    }
  }
  return parts.join(', ')
}

function costLabel(def) {
  if (def.param_costs) {
    const vals = Object.values(def.param_costs)
    const lo = Math.min(...vals), hi = Math.max(...vals)
    return (lo > 0 ? '+' : '') + lo + ' to ' + (hi > 0 ? '+' : '') + hi + ' DP'
  }
  if (def.max_tiers === 1) return (def.cost_per_tier > 0 ? '+' : '') + def.cost_per_tier + ' DP'
  if (def.cost_tier1 != null) return def.cost_tier1 + '+' + Math.abs(def.cost_per_tier) + '/Tier DP'
  return (def.cost_per_tier > 0 ? '+' : '') + def.cost_per_tier + '/Tier DP'
}

function ParamInput({ param, value, onChange, charSkillNames = [], charSpellListNames = [] }) {
  const sel = (opts) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12}}>
      <option value="">— select —</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  const txt = (ph) => (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={ph}
      style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12}} />
  )
  if (param === 'skill') {
    const charSet = new Set(charSkillNames)
    return (
      <>
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          list="eq-skill-dl" placeholder="Type or choose a skill or spell list..."
          style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12}} />
        <datalist id="eq-skill-dl">
          {/* Character's actual named skills first */}
          {charSkillNames.map(n => <option key={'chr_'+n} value={n} />)}
          {/* Character's spell lists */}
          {charSpellListNames.map(n => <option key={'sl_'+n} value={n} />)}
          {/* Then remaining static skill names not already listed */}
          {ALL_SKILL_NAMES.filter(n => !charSet.has(n)).map(n => <option key={n} value={n} />)}
        </datalist>
      </>
    )
  }
  if (param === 'element') return sel(ELEMENTS)
  if (param === 'realm') return sel(REALMS)
  if (param === 'stat') return sel(STATS)
  if (param === 'sense') return sel(SENSES)
  if (param === 'animal_type') return txt('e.g. Horses, Dogs, Eagles...')
  if (param === 'sense_description') return txt('e.g. detect evil magic, smell fear...')
  if (param === 'spell_list') {
    return (
      <>
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          list="eq-spelllist-dl" placeholder="Type or choose a spell list..."
          style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12}} />
        <datalist id="eq-spelllist-dl">
          {charSpellListNames.map(n => <option key={n} value={n} />)}
        </datalist>
      </>
    )
  }
  return txt('Details...')
}

function WeaponsCard({ activeChar, addWeapon, updateWeapon, removeWeapon }) {
  const weapons = activeChar.weapons || []
  const [expanded, setExpanded]     = useState(null)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseSearch, setBrowseSearch] = useState('')
  const [catFilter, setCatFilter]   = useState('All')
  const [obFilter, setObFilter]     = useState('All')

  const filtered = useMemo(() => {
    const q = browseSearch.toLowerCase()
    return weaponsData.filter(w => {
      if (catFilter !== 'All' && w.skill_name !== catFilter) return false
      if (obFilter !== 'All' && w.ob_type !== obFilter) return false
      if (q && !w.name.toLowerCase().includes(q) && !w.skill_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [browseSearch, catFilter, obFilter])

  function selectWeapon(wDef) {
    addWeapon({ name: wDef.name, fumble: wDef.fumble, str_req: wDef.str_req, skill_name: wDef.skill_name, ob_type: wDef.ob_type })
    setBrowseOpen(false)
    setBrowseSearch('')
    setCatFilter('All')
    setObFilter('All')
  }

  function cancelBrowse() {
    setBrowseOpen(false)
    setBrowseSearch('')
  }

  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,margin:'12px 12px 0',overflow:'hidden'}}>
      <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',background:'var(--surface2)',
        display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontWeight:700,fontSize:12,letterSpacing:'0.08em',color:'var(--text2)',textTransform:'uppercase'}}>Weapons</span>
        <button onClick={()=>addWeapon()}
          style={{background:'none',border:'1px solid var(--border2)',borderRadius:5,padding:'2px 8px',color:'var(--text3)',fontSize:11,cursor:'pointer'}}>
          + Custom
        </button>
      </div>
      <div style={{padding:12}}>

        {weapons.length === 0 && !browseOpen && (
          <div style={{color:'var(--text3)',fontSize:12,textAlign:'center',padding:'6px 0 8px'}}>No weapons</div>
        )}

        {weapons.map(w => {
          const isOpen = expanded === w.id
          const ob = getWeaponOB(activeChar, w)
          const skillRanks = (activeChar.skills?.[w.skill_name]?.ranks) ?? 0
          const effFumble = Math.max(1, (w.fumble ?? 3) - Math.floor(skillRanks / 5))
          const fumbleReduced = effFumble < (w.fumble ?? 3)
          const skillColor = W_SKILL_COLOR[w.skill_name] ?? 'var(--text3)'
          return (
            <div key={w.id} style={{border:'1px solid var(--border2)',borderRadius:8,marginBottom:6,overflow:'hidden'}}>
              <div onClick={() => setExpanded(isOpen ? null : w.id)}
                style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',cursor:'pointer',
                  background:isOpen?'var(--surface2)':'transparent'}}>
                <span style={{fontSize:10,color:'var(--text3)',flexShrink:0,display:'flex',alignItems:'center'}}>
                  {isOpen ? <ChevronDownIcon size={10} color="var(--text3)"/> : <ChevronRightIcon size={10} color="var(--text3)"/>}
                </span>
                <span style={{flex:1,fontSize:13,fontWeight:600,color:'var(--text)'}}>
                  {w.name || <span style={{color:'var(--text3)',fontStyle:'italic'}}>Unnamed weapon</span>}
                </span>
                {w.skill_name && (
                  <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,fontWeight:700,
                    background:skillColor+'22',color:skillColor,flexShrink:0}}>
                    {w.skill_name}
                  </span>
                )}
                <span style={{fontSize:12,fontWeight:700,flexShrink:0,
                  color:ob>0?'var(--success)':ob<0?'var(--danger)':'var(--text2)'}}>
                  OB {ob >= 0 ? '+' : ''}{ob}
                </span>
                <span style={{fontSize:11,color:fumbleReduced?'var(--success)':'var(--text3)',flexShrink:0}}>
                  F:{effFumble}{fumbleReduced ? <ArrowDownIcon size={9} color="currentColor" /> : ''}
                </span>
                <button onClick={e=>{e.stopPropagation();removeWeapon(w.id)}}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
                  onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}
                  style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',padding:2,display:'flex',alignItems:'center',flexShrink:0}}>
                  <XIcon size={12} color="currentColor"/>
                </button>
              </div>

              {isOpen && (
                <div style={{padding:'8px 10px 10px',borderTop:'1px solid var(--border)',background:'var(--surface2)'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 70px 70px 80px',gap:6,marginBottom:8}}>
                    <div>
                      <div style={{fontSize:10,color:'var(--text3)',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.06em'}}>Name</div>
                      <input value={w.name||''} onChange={e=>updateWeapon(w.id,{name:e.target.value})}
                        placeholder="Weapon name"
                        style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border2)',
                          borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:'var(--text3)',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.06em'}}>
                        Fumble{fumbleReduced ? ` (${effFumble} eff)` : ''}
                      </div>
                      <input type="number" value={w.fumble??3} min={1} max={20}
                        onChange={e=>updateWeapon(w.id,{fumble:Number(e.target.value)||1})}
                        style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border2)',
                          borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12,textAlign:'center'}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:'var(--text3)',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.06em'}}>Str Req</div>
                      <input type="number" value={w.str_req??0} min={0}
                        onChange={e=>updateWeapon(w.id,{str_req:Number(e.target.value)||0})}
                        style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border2)',
                          borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12,textAlign:'center'}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:'var(--text3)',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.06em'}}>Item Bonus</div>
                      <input type="number" value={w.item_bonus??0}
                        onChange={e=>updateWeapon(w.id,{item_bonus:Number(e.target.value)||0})}
                        style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border2)',
                          borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12,textAlign:'center'}}/>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                    <div>
                      <div style={{fontSize:10,color:'var(--text3)',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.06em'}}>Combat Skill</div>
                      <input value={w.skill_name||''} onChange={e=>updateWeapon(w.id,{skill_name:e.target.value})}
                        list="eq-weapon-skill-dl" placeholder="e.g. Blade"
                        style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border2)',
                          borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12}}/>
                      <datalist id="eq-weapon-skill-dl">
                        {W_SKILL_CATS.filter(s=>s!=='All').map(s=><option key={s} value={s}/>)}
                      </datalist>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:'var(--text3)',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.06em'}}>OB Type</div>
                      <select value={w.ob_type||'melee'} onChange={e=>updateWeapon(w.id,{ob_type:e.target.value})}
                        style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border2)',
                          borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12}}>
                        <option value="melee">Melee (Ag+St)</option>
                        <option value="ranged">Ranged (Ag+Qu)</option>
                        <option value="unarmed">Unarmed (Ag+St)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Browse panel */}
        {browseOpen && (
          <div style={{border:'1px solid var(--border2)',borderRadius:8,marginBottom:8,overflow:'hidden'}}>
            <div style={{padding:'8px 10px',background:'var(--surface2)',borderBottom:'1px solid var(--border)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <input type="text" value={browseSearch} onChange={e=>setBrowseSearch(e.target.value)}
                placeholder="Search weapons..." autoFocus
                style={{flex:1,minWidth:120,background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 7px',color:'var(--text)',fontSize:12}}/>
              <select value={obFilter} onChange={e=>setObFilter(e.target.value)}
                style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12}}>
                {W_OB_TYPES.map(t=><option key={t} value={t}>{t==='All'?'All types':t}</option>)}
              </select>
              <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
                style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12,minWidth:100}}>
                {W_SKILL_CATS.map(c=><option key={c} value={c}>{c==='All'?'All skills':c}</option>)}
              </select>
              <button onClick={cancelBrowse}
                style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',padding:2,display:'flex',alignItems:'center'}}>
                <XIcon size={14} color="currentColor"/>
              </button>
            </div>
            <div style={{maxHeight:300,overflowY:'auto'}}>
              {filtered.length === 0 && (
                <div style={{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:12}}>No matches</div>
              )}
              {filtered.map(wDef => {
                const color = W_SKILL_COLOR[wDef.skill_name] ?? 'var(--text3)'
                return (
                  <div key={wDef.name} onClick={()=>selectWeapon(wDef)}
                    style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',cursor:'pointer',display:'flex',gap:8,alignItems:'center'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{fontWeight:600,fontSize:13,color:'var(--text)',marginRight:8}}>{wDef.name}</span>
                      <span style={{fontSize:11,color:'var(--text3)'}}>{wDef.ob_type}</span>
                    </div>
                    <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,fontWeight:700,flexShrink:0,
                      background:color+'22',color}}>{wDef.skill_name}</span>
                    <div style={{flexShrink:0,textAlign:'right',fontSize:11,color:'var(--text2)',display:'flex',gap:10}}>
                      <span>Fumble <strong style={{color:wDef.fumble>=8?'var(--danger)':wDef.fumble>=6?'#f97316':'var(--text)'}}>{wDef.fumble}</strong></span>
                      {wDef.str_req > 0 && <span style={{color:'var(--text3)'}}>Str {wDef.str_req}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!browseOpen && (
          <button onClick={()=>setBrowseOpen(true)}
            style={{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:6,padding:'5px 12px',
              color:'var(--text2)',fontSize:12,cursor:'pointer',fontWeight:600,marginTop:weapons.length?4:0}}>
            + Add Weapon from Database
          </button>
        )}
      </div>
    </div>
  )
}

function TalentsCard({ activeChar, addTalent, updateTalent, removeTalent }) {
  const talents = activeChar.talents || []
  const [expanded, setExpanded] = useState(null)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseSearch, setBrowseSearch] = useState('')
  const [browseFilter, setBrowseFilter] = useState('All')
  const [configuring, setConfiguring] = useState(null)
  const [configTier, setConfigTier] = useState(1)
  const [configParam, setConfigParam] = useState('')
  // Multi-skill: which talent instance is receiving a new skill entry
  const [addSkillFor, setAddSkillFor] = useState(null)
  const [newSkillVal, setNewSkillVal] = useState('')

  const filtered = useMemo(() => {
    const q = browseSearch.toLowerCase()
    return talentsData.filter(t => {
      if (browseFilter !== 'All' && t.category !== browseFilter) return false
      if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
      return true
    })
  }, [browseSearch, browseFilter])

  // Build resolved skill names from character's actual skills (e.g. "Music: Singing" not "Music: <instrument 1>")
  const charSkillNames = useMemo(() => {
    const names = new Set()
    for (const [tmpl, sk] of Object.entries(activeChar.skills || {})) {
      names.add(resolveSkillName(tmpl, sk.label))
    }
    for (const cs of (activeChar.custom_skills || [])) {
      names.add(resolveSkillName(cs.template_name, cs.label))
    }
    return [...names].sort()
  }, [activeChar.skills, activeChar.custom_skills])

  // Spell list names the character has ranks in
  const charSpellListNames = useMemo(() =>
    Object.keys(activeChar.spell_lists || {}).sort()
  , [activeChar.spell_lists])

  function openConfigure(def) { setConfiguring(def); setConfigTier(1); setConfigParam('') }

  function confirmAdd() {
    if (!configuring) return
    if (configuring.param && !configParam.trim()) return
    addTalent(configuring.id, configTier, configParam.trim() || null)
    setConfiguring(null); setBrowseOpen(false); setBrowseSearch('')
  }

  function cancelBrowse() { setConfiguring(null); setBrowseOpen(false); setBrowseSearch('') }

  function addExtraSkill(instId, extraParams) {
    const val = newSkillVal.trim()
    if (!val) return
    updateTalent(instId, { extra_params: [...(extraParams || []), val] })
    setAddSkillFor(null)
    setNewSkillVal('')
  }

  function removeExtraSkill(instId, extraParams, idx) {
    updateTalent(instId, { extra_params: extraParams.filter((_, i) => i !== idx) })
  }

  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,margin:'12px 12px 0',overflow:'hidden'}}>
      <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',background:'var(--surface2)',
        fontWeight:700,fontSize:12,letterSpacing:'0.08em',color:'var(--text2)',textTransform:'uppercase'}}>
        Talents &amp; Flaws
      </div>
      <div style={{padding:12}}>
        {talents.length === 0 && !browseOpen && (
          <div style={{color:'var(--text3)',fontSize:12,textAlign:'center',padding:'6px 0 8px'}}>No talents or flaws</div>
        )}

        {talents.map(inst => {
          const def = talentsData.find(t => t.id === inst.talent_id)
          if (!def) return null
          const isOpen = expanded === inst.id
          const summary = effectSummary(def, inst)
          const cost = tierCost(def, inst.tier, inst.param)
          const tierLabel = def.max_tiers > 1 ? ' ' + (ROMAN[inst.tier-1] || inst.tier) : ''
          const extraCount = (inst.extra_params || []).filter(Boolean).length
          const paramLabel = inst.param
            ? ` (${inst.param}${extraCount > 0 ? ` +${extraCount} more` : ''})`
            : ''
          const isMultiSkill = def.param === 'skill' || def.param === 'spell_list'
          const isAddingSkill = addSkillFor === inst.id
          return (
            <div key={inst.id} style={{border:'1px solid var(--border2)',borderRadius:8,marginBottom:6,overflow:'hidden'}}>
              <div onClick={() => { setExpanded(isOpen ? null : inst.id); if (isOpen) { setAddSkillFor(null); setNewSkillVal('') } }}
                style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',cursor:'pointer',
                  background:isOpen?'var(--surface2)':'transparent'}}>
                <span style={{fontSize:10,color:'var(--text3)',flexShrink:0,display:'flex',alignItems:'center'}}>
                  {isOpen ? <ChevronDownIcon size={10} color="var(--text3)"/> : <ChevronRightIcon size={10} color="var(--text3)"/>}
                </span>
                <span style={{flex:1,fontSize:13,fontWeight:600,color:def.is_flaw?'var(--danger)':'var(--text)'}}>
                  {def.name}{tierLabel}{paramLabel}
                </span>
                {summary && <span style={{fontSize:11,color:'var(--purple)',flexShrink:0}}>{summary}</span>}
                <span style={{fontSize:11,color:cost<0?'var(--success)':'var(--text3)',flexShrink:0}}>
                  {cost>0?'+':''}{cost} DP
                </span>
                <span style={{display:'inline-block',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700,
                  background:CAT_COLOR[def.category]+'22',color:CAT_COLOR[def.category],flexShrink:0}}>
                  {def.category}
                </span>
                <button onClick={e=>{e.stopPropagation();removeTalent(inst.id)}}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
                  onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}
                  style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',padding:2,display:'flex',alignItems:'center',flexShrink:0}}>
                  <XIcon size={12} color="currentColor"/>
                </button>
              </div>
              {isOpen && (
                <div style={{padding:'8px 12px 10px',borderTop:'1px solid var(--border)',background:'var(--surface2)'}}>
                  <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.5}}>{def.description}</div>
                  {/* Show auto-applied summary only for non-multi-skill talents */}
                  {summary && !(isMultiSkill && inst.param) && (
                    <div style={{marginTop:6,fontSize:11,color:'var(--purple)'}}>Auto-applied: {summary}</div>
                  )}

                  {/* Multi-skill target manager */}
                  {isMultiSkill && inst.param && (
                    <div style={{marginTop:10,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                      <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',
                        letterSpacing:'0.07em',marginBottom:7}}>
                        {def.param === 'spell_list' ? 'Spell Lists' : 'Skills'}
                        {summary && <span style={{marginLeft:8,color:'var(--purple)',fontWeight:400,textTransform:'none',letterSpacing:0}}>{summary.split(' to ')[0]}</span>}
                      </div>
                      {/* Pills: primary + extra, all inline */}
                      <div style={{display:'flex',flexWrap:'wrap',gap:5,alignItems:'center'}}>
                        {/* Primary — not removable */}
                        <span style={{fontSize:11,background:'var(--accent)22',color:'var(--accent)',
                          padding:'3px 10px',borderRadius:12,fontWeight:600,border:'1px solid var(--accent)44'}}>
                          {inst.param}
                        </span>
                        {/* Extra params */}
                        {(inst.extra_params || []).map((sk, idx) => (
                          <span key={idx} style={{display:'inline-flex',alignItems:'center',gap:4,
                            fontSize:11,background:'var(--surface)',border:'1px solid var(--border2)',
                            padding:'3px 8px 3px 10px',borderRadius:12,color:'var(--text)'}}>
                            {sk}
                            <button
                              onClick={e => { e.stopPropagation(); removeExtraSkill(inst.id, inst.extra_params || [], idx) }}
                              style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',
                                padding:0,display:'flex',alignItems:'center',lineHeight:1}}
                              onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
                              onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}
                              title="Remove">
                              <XIcon size={10} color="currentColor"/>
                            </button>
                          </span>
                        ))}
                        {/* Add inline */}
                        {isAddingSkill ? (
                          <>
                            <input autoFocus type="text" value={newSkillVal}
                              onChange={e => setNewSkillVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') addExtraSkill(inst.id, inst.extra_params)
                                if (e.key === 'Escape') { setAddSkillFor(null); setNewSkillVal('') }
                              }}
                              list="tal-extra-skill-dl"
                              placeholder={def.param === 'spell_list' ? 'Spell list name…' : 'Type or choose a skill…'}
                              style={{width:170,background:'var(--surface)',border:'1px solid var(--border2)',
                                borderRadius:5,padding:'3px 7px',color:'var(--text)',fontSize:12}} />
                            <datalist id="tal-extra-skill-dl">
                              {def.param === 'spell_list'
                                ? charSpellListNames.map(n => <option key={n} value={n} />)
                                : [...charSkillNames, ...charSpellListNames].map(n => <option key={n} value={n} />)
                              }
                            </datalist>
                            <button onClick={() => addExtraSkill(inst.id, inst.extra_params)}
                              style={{background:'var(--accent)',border:'none',borderRadius:5,padding:'3px 10px',
                                color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>Add</button>
                            <button onClick={() => { setAddSkillFor(null); setNewSkillVal('') }}
                              style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',
                                fontSize:14,lineHeight:1,padding:'0 2px'}}>×</button>
                          </>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setAddSkillFor(inst.id); setNewSkillVal('') }}
                            style={{background:'none',border:'1px dashed var(--border2)',borderRadius:12,
                              padding:'2px 10px',color:'var(--text3)',fontSize:11,cursor:'pointer'}}>
                            + Add
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {browseOpen && !configuring && (
          <div style={{border:'1px solid var(--border2)',borderRadius:8,marginBottom:8,overflow:'hidden'}}>
            <div style={{padding:'8px 10px',background:'var(--surface2)',borderBottom:'1px solid var(--border)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <input type="text" value={browseSearch} onChange={e=>setBrowseSearch(e.target.value)}
                placeholder="Search talents..." autoFocus
                style={{flex:1,minWidth:120,background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 7px',color:'var(--text)',fontSize:12}}/>
              <select value={browseFilter} onChange={e=>setBrowseFilter(e.target.value)}
                style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 6px',color:'var(--text)',fontSize:12}}>
                {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={cancelBrowse}
                style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',padding:2,display:'flex',alignItems:'center'}}>
                <XIcon size={14} color="currentColor"/>
              </button>
            </div>
            <div style={{maxHeight:300,overflowY:'auto'}}>
              {filtered.length === 0 && (
                <div style={{padding:'12px',textAlign:'center',color:'var(--text3)',fontSize:12}}>No matches</div>
              )}
              {filtered.map(def => (
                <div key={def.id} onClick={()=>openConfigure(def)}
                  style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',cursor:'pointer',display:'flex',gap:8,alignItems:'flex-start'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{flex:1,minWidth:0}}>
                    <span style={{fontWeight:600,fontSize:13,color:def.is_flaw?'var(--danger)':'var(--text)',marginRight:6}}>{def.name}</span>
                    <span style={{fontSize:11,color:'var(--text3)'}}>
                      {def.description.slice(0,90)}{def.description.length>90?'...':''}
                    </span>
                  </div>
                  <div style={{flexShrink:0,textAlign:'right'}}>
                    <span style={{display:'block',fontSize:11,color:def.is_flaw?'var(--success)':'var(--text2)'}}>{costLabel(def)}</span>
                    <span style={{display:'inline-block',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700,marginTop:2,
                      background:CAT_COLOR[def.category]+'22',color:CAT_COLOR[def.category]}}>
                      {def.category}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {browseOpen && configuring && (
          <div style={{border:'1px solid var(--border2)',borderRadius:8,marginBottom:8,overflow:'hidden'}}>
            <div style={{padding:'10px 12px',background:'var(--surface2)',borderBottom:'1px solid var(--border)',display:'flex',gap:8,alignItems:'center'}}>
              <button onClick={()=>setConfiguring(null)}
                style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:18,lineHeight:1,padding:'0 4px 0 0'}}>
                &#8249;
              </button>
              <span style={{fontWeight:700,fontSize:13,flex:1,color:configuring.is_flaw?'var(--danger)':'var(--text)'}}>{configuring.name}</span>
              <span style={{fontSize:11,color:'var(--text3)'}}>{configuring.category}</span>
            </div>
            <div style={{padding:'10px 12px'}}>
              <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.5,marginBottom:10}}>{configuring.description}</div>

              {configuring.max_tiers > 1 && (
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:'var(--text3)',marginBottom:5,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase'}}>Tier</div>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    {Array.from({length:configuring.max_tiers},(_,i)=>i+1).map(t => {
                      const cost = tierCost(configuring, t, configParam)
                      return (
                        <button key={t} onClick={()=>setConfigTier(t)}
                          style={{padding:'4px 10px',borderRadius:5,fontSize:12,cursor:'pointer',fontWeight:configTier===t?700:400,
                            background:configTier===t?'var(--accent)':'var(--surface2)',
                            border:'1px solid '+(configTier===t?'var(--accent)':'var(--border2)'),
                            color:configTier===t?'#fff':'var(--text2)'}}>
                          {ROMAN[t-1]||t} <span style={{fontSize:10,opacity:0.8}}>({cost>0?'+':''}{cost} DP)</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {configuring.param && (
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:'var(--text3)',marginBottom:5,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase'}}>
                    {{'skill':'Skill','element':'Element','realm':'Realm','stat':'Stat','sense':'Sense',
                      'animal_type':'Animal Type','sense_description':'Sense Description','spell_list':'Spell List'}[configuring.param] || 'Details'}
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <ParamInput param={configuring.param} value={configParam} onChange={setConfigParam} charSkillNames={charSkillNames} charSpellListNames={charSpellListNames}/>
                  </div>
                </div>
              )}

              {configuring.effects?.some(e=>e.type!==undefined) && configuring.effects.length > 0 && (configParam || !configuring.param) && (
                <div style={{marginBottom:10,padding:'6px 8px',background:'rgba(139,92,246,0.1)',borderRadius:6,fontSize:12,color:'var(--purple)'}}>
                  Auto-applies: {effectSummary(configuring,{tier:configTier,param:configParam}) || 'none'}
                </div>
              )}

              {/* Live cost preview for param_costs talents (e.g. Missing Sense) */}
              {configuring.param_costs && configParam && configuring.param_costs[configParam] != null && (
                <div style={{marginBottom:10,padding:'5px 8px',background:'rgba(239,68,68,0.08)',borderRadius:6,fontSize:12,color:'var(--danger)'}}>
                  Cost for {configParam}: {configuring.param_costs[configParam]} DP
                </div>
              )}

              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <button onClick={()=>setConfiguring(null)}
                  style={{background:'none',border:'1px solid var(--border2)',borderRadius:6,padding:'5px 12px',color:'var(--text2)',fontSize:12,cursor:'pointer'}}>
                  Back
                </button>
                <button onClick={confirmAdd}
                  disabled={!!(configuring.param && !configParam.trim())}
                  style={{background:'var(--accent)',border:'none',borderRadius:6,padding:'5px 14px',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',
                    opacity:(configuring.param&&!configParam.trim())?0.5:1}}>
                  Add {configuring.is_flaw?'Flaw':'Talent'}
                </button>
              </div>
            </div>
          </div>
        )}

        {!browseOpen && (
          <button onClick={()=>setBrowseOpen(true)}
            style={{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:6,padding:'5px 12px',
              color:'var(--text2)',fontSize:12,cursor:'pointer',fontWeight:600,marginTop:talents.length?4:0}}>
            + Add Talent / Flaw
          </button>
        )}
      </div>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,margin:'12px 12px 0',overflow:'hidden'}}>
      <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',background:'var(--surface2)',
        fontWeight:700,fontSize:12,letterSpacing:'0.08em',color:'var(--text2)',textTransform:'uppercase'}}>
        {title}
      </div>
      <div style={{padding:12}}>{children}</div>
    </div>
  )
}

function TinyInput({ value, onChange, placeholder, style, type = 'text' }) {
  return (
    <input type={type} value={value ?? ''}
      onChange={e => onChange(type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value)}
      placeholder={placeholder}
      style={{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 6px',
        color:'var(--text)',fontSize:12,width:'100%',boxSizing:'border-box',...style}}
    />
  )
}

const SHIELD_DB = { 'Target Shield': 15, 'Normal Shield': 20, 'Full Shield': 25, 'Wall Shield': 30 }
const ARMOR_SECTION_MAP = { torso: 'torso', head: 'helmet', arms: 'vambraces', legs: 'greaves' }
const ARMOR_SLOT_LABELS = { torso: 'Torso', head: 'Head', arms: 'Arms', legs: 'Legs' }

function ArmorCard({ activeChar, updateArmorPart }) {
  const armorParts = activeChar.armor_parts || {}
  const [customAt, setCustomAt] = useState({})

  const fullSuitOptions = armorData.full_suit.filter(p => p.at !== 1)

  function handleQuickSet(e) {
    const at = Number(e.target.value)
    if (!at) return
    ;['torso', 'head', 'arms', 'legs'].forEach(slot => {
      const section = ARMOR_SECTION_MAP[slot]
      const piece = armorData[section]?.find(p => p.at === at)
      if (piece) updateArmorPart(slot, { at: piece.at, name: piece.name, custom: false })
    })
  }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, margin:'12px 12px 0', overflow:'hidden' }}>
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', background:'var(--surface2)',
        fontWeight:700, fontSize:12, letterSpacing:'0.08em', color:'var(--text2)', textTransform:'uppercase' }}>
        Armor
      </div>
      <div style={{ padding:12 }}>
        {/* Quick set all row */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <span style={{ fontSize:11, color:'var(--text3)', flexShrink:0 }}>Quick set all:</span>
          <select defaultValue="" onChange={handleQuickSet}
            style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:5, padding:'4px 6px', color:'var(--text)', fontSize:12 }}>
            <option value="">— choose —</option>
            {fullSuitOptions.map(p => (
              <option key={p.at} value={p.at}>{p.name} (AT {p.at})</option>
            ))}
          </select>
        </div>

        {/* Body part rows */}
        <div style={{ border:'1px solid var(--border)', borderRadius:7, overflow:'hidden' }}>
          {['torso','head','arms','legs'].map((slot, i) => {
            const ap = armorParts[slot] || { at: 1 }
            const section = ARMOR_SECTION_MAP[slot]
            const pieces = armorData[section] || []
            const matchedPiece = pieces.find(p => p.at === (ap.at ?? 1)) || pieces[0]
            const penalty = matchedPiece?.maneuver_penalty
            const isCustom = ap.custom === true
            const selectValue = isCustom ? 'custom' : (matchedPiece?.at ?? 1)

            return (
              <div key={slot} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px' }}>
                  <span style={{ width:60, flexShrink:0, fontSize:12, fontWeight:600, color:'var(--text2)' }}>
                    {ARMOR_SLOT_LABELS[slot]}
                  </span>
                  <select value={selectValue}
                    onChange={e => {
                      const val = e.target.value
                      if (val === 'custom') {
                        updateArmorPart(slot, { custom: true })
                      } else {
                        const piece = pieces.find(p => p.at === Number(val))
                        if (piece) updateArmorPart(slot, { at: piece.at, name: piece.name, custom: false })
                      }
                    }}
                    style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:5, padding:'4px 5px', color:'var(--text)', fontSize:12 }}>
                    {pieces.map(p => (
                      <option key={p.at} value={p.at}>{p.name} (AT {p.at})</option>
                    ))}
                    <option value="custom">Custom…</option>
                  </select>
                  <span style={{ width:60, flexShrink:0, textAlign:'right', fontSize:11,
                    color: penalty && penalty < 0 ? 'var(--danger)' : 'var(--text3)', fontWeight: penalty && penalty < 0 ? 600 : 400 }}>
                    {penalty && penalty !== 0 ? penalty : `AT ${ap.at ?? 1}`}
                  </span>
                </div>
                {isCustom && (
                  <div style={{ display:'flex', gap:6, padding:'0 8px 6px', paddingLeft:74 }}>
                    <input type="text" value={ap.name || ''} placeholder="Armor name"
                      onChange={e => updateArmorPart(slot, { name: e.target.value })}
                      style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:5, padding:'3px 6px', color:'var(--text)', fontSize:12 }} />
                    <select value={ap.at ?? 1} onChange={e => updateArmorPart(slot, { at: Number(e.target.value) })}
                      style={{ width:70, background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:5, padding:'3px 5px', color:'var(--text)', fontSize:12 }}>
                      {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>AT {n}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )
          })}

          {/* Shield row */}
          {(() => {
            const shield = armorParts.shield || { type: null, db: 0 }
            return (
              <div style={{ borderTop:'1px solid var(--border)', background:'var(--surface2)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px' }}>
                  <span style={{ width:60, flexShrink:0, fontSize:12, fontWeight:600, color:'var(--text2)' }}>Shield</span>
                  <select value={shield.type || 'None'}
                    onChange={e => {
                      const val = e.target.value
                      updateArmorPart('shield', { type: val === 'None' ? null : val })
                    }}
                    style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:5, padding:'4px 5px', color:'var(--text)', fontSize:12 }}>
                    <option value="None">None</option>
                    {armorData.shields.map(s => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                  <span style={{ width:60, flexShrink:0, textAlign:'right', fontSize:11,
                    color: shield.type ? 'var(--success)' : 'var(--text3)', fontWeight: shield.type ? 700 : 400 }}>
                    {shield.type ? `+${SHIELD_DB[shield.type]} DB` : '—'}
                  </span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

export default function EquipmentView() {
  const { activeChar, addEquipment, updateEquipment, removeEquipment,
          addMagicItem, updateMagicItem, removeMagicItem, updateCharacter,
          addWeapon, updateWeapon, removeWeapon,
          addTalent, updateTalent, removeTalent,
          updateArmorPart } = useCharacter()
  const [expandedMagic, setExpandedMagic] = useState(null)

  if (!activeChar) return null

  const equipment = activeChar.equipment || []
  const magicItems = activeChar.magic_items || []
  const traits = activeChar.traits || []
  const totalWeight = equipment.reduce((s, e) => s + ((e.weight || 0) * (e.qty || 1)), 0)

  function addTrait() {
    updateCharacter({ traits: [...traits, { id: 'tr_'+Date.now(), name:'', tier:'Minor', effect:'' }] })
  }
  function updateTrait(id, patch) {
    updateCharacter({ traits: traits.map(t => t.id === id ? { ...t, ...patch } : t) })
  }
  function removeTrait(id) {
    updateCharacter({ traits: traits.filter(t => t.id !== id) })
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 16 }}>
      <Card title="Equipment">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ color:'var(--text3)', fontSize:11 }}>
                <th style={{ textAlign:'left', padding:'4px 4px 6px', fontWeight:600 }}>Item</th>
                <th style={{ textAlign:'center', padding:'4px 4px 6px', fontWeight:600, width:40 }}>#</th>
                <th style={{ textAlign:'center', padding:'4px 4px 6px', fontWeight:600, width:52 }}>Wt (ea)</th>
                <th style={{ textAlign:'left', padding:'4px 4px 6px', fontWeight:600, width:90 }}>Location</th>
                <th style={{ width:24 }} />
              </tr>
            </thead>
            <tbody>
              {equipment.map((item, i) => (
                <tr key={item.id} style={{ borderTop: i===0?'none':'1px solid var(--border)' }}>
                  <td style={{ padding:'3px 4px' }}>
                    <input value={item.name||''} onChange={e=>updateEquipment(item.id,{name:e.target.value})}
                      list="eq-items-dl" placeholder="Item name"
                      style={{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 6px',
                        color:'var(--text)',fontSize:12,width:'100%',boxSizing:'border-box'}}/>
                    <datalist id="eq-items-dl">
                      {COMMON_ITEMS.map(([n])=><option key={n} value={n}/>)}
                    </datalist>
                  </td>
                  <td style={{ padding:'3px 4px' }}>
                    <TinyInput type="number" value={item.qty} onChange={v=>updateEquipment(item.id,{qty:v})} style={{textAlign:'center'}}/>
                  </td>
                  <td style={{ padding:'3px 4px' }}>
                    <TinyInput type="number" value={item.weight} onChange={v=>updateEquipment(item.id,{weight:v})} placeholder="0" style={{textAlign:'center'}}/>
                  </td>
                  <td style={{ padding:'3px 4px' }}>
                    <select value={item.location||''} onChange={e=>updateEquipment(item.id,{location:e.target.value})}
                      style={{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 4px',color:'var(--text)',fontSize:12,width:'100%'}}>
                      <option value="">—</option>
                      {LOCATIONS.map(l=><option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'3px 4px', textAlign:'center' }}>
                    <button onClick={()=>removeEquipment(item.id)}
                      onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
                      onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}
                      style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:14,padding:2}}>&#x2715;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
          <button onClick={()=>addEquipment({})}
            style={{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:6,padding:'5px 12px',color:'var(--text2)',fontSize:12,cursor:'pointer',fontWeight:600}}>
            + Add Item
          </button>
          <span style={{ fontSize:12, color:'var(--text2)' }}>
            Total: <strong style={{ color:'var(--text)' }}>{totalWeight.toFixed(1)}</strong> lbs
          </span>
        </div>
      </Card>

      <ArmorCard activeChar={activeChar} updateArmorPart={updateArmorPart} />

      <Card title="Magic Items">
        {magicItems.length === 0 && (
          <div style={{ color:'var(--text3)', fontSize:12, textAlign:'center', padding:'8px 0' }}>No magic items</div>
        )}
        {magicItems.map(item => (
          <div key={item.id} style={{ border:'1px solid var(--border2)', borderRadius:8, marginBottom:8, overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', cursor:'pointer',
              background:expandedMagic===item.id?'var(--surface2)':'transparent' }}
              onClick={()=>setExpandedMagic(expandedMagic===item.id?null:item.id)}>
              {expandedMagic===item.id ? <ChevronDownIcon size={10} color="var(--text3)"/> : <ChevronRightIcon size={10} color="var(--text3)"/>}
              <input value={item.name} onChange={e=>{e.stopPropagation();updateMagicItem(item.id,{name:e.target.value})}}
                onClick={e=>e.stopPropagation()} placeholder="Item name"
                style={{flex:1,background:'transparent',border:'none',color:'var(--text)',fontSize:13,fontWeight:600,outline:'none'}}/>
              <span style={{ fontSize:11, color:'var(--text3)' }}>OB {item.ob>0?'+':''}{item.ob||0} / DB {item.db>0?'+':''}{item.db||0}</span>
              <button onClick={e=>{e.stopPropagation();removeMagicItem(item.id)}}
                onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
                onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}
                style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:13,padding:2}}>&#x2715;</button>
            </div>
            {expandedMagic===item.id && (
              <div style={{ padding:'8px 10px 10px', borderTop:'1px solid var(--border)', display:'grid', gap:8 }}>
                <div>
                  <div style={{ fontSize:10, color:'var(--text3)', marginBottom:3 }}>PROPERTIES</div>
                  <textarea value={item.properties||''} onChange={e=>updateMagicItem(item.id,{properties:e.target.value})}
                    rows={2} placeholder="Magical properties..."
                    style={{width:'100%',boxSizing:'border-box',background:'var(--surface2)',border:'1px solid var(--border2)',
                      borderRadius:5,padding:'5px 7px',color:'var(--text)',fontSize:12,resize:'vertical',fontFamily:'inherit'}}/>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {[['OB Bonus','ob'],['DB Bonus','db'],['Weight','weight']].map(([label,field])=>(
                    <div key={field}>
                      <div style={{ fontSize:10, color:'var(--text3)', marginBottom:3 }}>{label}</div>
                      <TinyInput type="number" value={item[field]} onChange={v=>updateMagicItem(item.id,{[field]:v})} style={{textAlign:'center'}}/>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:10, color:'var(--text3)', marginBottom:3 }}>NOTES</div>
                  <TinyInput value={item.notes} onChange={v=>updateMagicItem(item.id,{notes:v})} placeholder="Additional notes..."/>
                </div>
              </div>
            )}
          </div>
        ))}
        <button onClick={addMagicItem}
          style={{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:6,padding:'5px 12px',color:'var(--text2)',fontSize:12,cursor:'pointer',fontWeight:600,marginTop:4}}>
          + Add Magic Item
        </button>
      </Card>

      <WeaponsCard activeChar={activeChar} addWeapon={addWeapon} updateWeapon={updateWeapon} removeWeapon={removeWeapon}/>
      <TalentsCard activeChar={activeChar} addTalent={addTalent} updateTalent={updateTalent} removeTalent={removeTalent}/>

      <Card title="Custom Traits">
        {traits.length === 0 && (
          <div style={{ color:'var(--text3)', fontSize:12, textAlign:'center', padding:'8px 0' }}>No custom traits</div>
        )}
        {traits.map(t => (
          <div key={t.id} style={{ display:'grid', gridTemplateColumns:'1fr 80px 1fr auto', gap:6, marginBottom:6, alignItems:'center' }}>
            <TinyInput value={t.name} onChange={v=>updateTrait(t.id,{name:v})} placeholder="Trait name"/>
            <select value={t.tier||'Minor'} onChange={e=>updateTrait(t.id,{tier:e.target.value})}
              style={{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:5,padding:'4px 4px',color:'var(--text)',fontSize:12}}>
              {['Minor','Major','Flaw'].map(tier=><option key={tier} value={tier}>{tier}</option>)}
            </select>
            <TinyInput value={t.effect} onChange={v=>updateTrait(t.id,{effect:v})} placeholder="Effect"/>
            <button onClick={()=>removeTrait(t.id)}
              onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
              onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}
              style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:14,padding:2}}>&#x2715;</button>
          </div>
        ))}
        <button onClick={addTrait}
          style={{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:6,padding:'5px 12px',color:'var(--text2)',fontSize:12,cursor:'pointer',fontWeight:600,marginTop:4}}>
          + Add Custom Trait
        </button>
      </Card>

      <Card title="Notes">
        <textarea value={activeChar.notes||''} onChange={e=>updateCharacter({notes:e.target.value})}
          rows={6} placeholder="Character notes, background, connections..."
          style={{width:'100%',boxSizing:'border-box',background:'var(--surface2)',border:'1px solid var(--border2)',
            borderRadius:6,padding:'8px 10px',color:'var(--text)',fontSize:13,resize:'vertical',fontFamily:'inherit',lineHeight:1.5}}/>
      </Card>
      <div style={{ height: 16 }} />
    </div>
  )
}
