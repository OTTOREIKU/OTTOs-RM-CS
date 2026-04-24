import React, { useState, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { CharacterContext } from './store/CharacterContext.jsx'
import {
  loadCharacters, loadActiveId, saveActiveId,
  createCharacter, deleteCharacter, updateCharacter,
  updateCharacterStat, updateSkill, updateSpellList,
  addWeapon, updateWeapon, removeWeapon,
  updateArmorPart,
  addEquipmentItem, updateEquipmentItem, removeEquipmentItem,
  addMagicItem, updateMagicItem, removeMagicItem,
  addCustomSkill, updateCustomSkill, removeCustomSkill,
  addTalent, updateTalent, removeTalent,
  removeSpellList,
} from './store/characters.js'
import Shell from './components/Shell.jsx'
import CharacterSheet from './views/CharacterSheet.jsx'
import SkillsView from './views/SkillsView.jsx'
import SpellsView from './views/SpellsView.jsx'
import ReferenceView from './views/ReferenceView.jsx'
import LevelUpView from './views/LevelUpView.jsx'
import WelcomeView from './views/WelcomeView.jsx'
import EquipmentView from './views/EquipmentView.jsx'

export default function App() {
  const [characters, setCharacters] = useState(() => loadCharacters())
  const [activeId, setActiveId] = useState(() => {
    const id = loadActiveId()
    const chars = loadCharacters()
    return id && chars[id] ? id : Object.keys(chars)[0] || null
  })

  const refresh = useCallback(() => {
    const chars = loadCharacters()
    setCharacters(chars)
    // Sync active ID — it may have changed (e.g. after import)
    setActiveId(id => {
      const storedId = loadActiveId()
      if (storedId && chars[storedId]) return storedId
      if (id && chars[id]) return id
      return Object.keys(chars)[0] || null
    })
  }, [])

  const switchCharacter = useCallback((id) => { saveActiveId(id); setActiveId(id) }, [])

  const handleCreate = useCallback(() => {
    const char = createCharacter()
    setCharacters(loadCharacters())
    setActiveId(char.id)
    return char
  }, [])

  const handleDelete = useCallback((id) => {
    const newActive = deleteCharacter(id)
    setCharacters(loadCharacters())
    setActiveId(newActive)
  }, [])

  const handleUpdate = useCallback((patch) => {
    if (!activeId) return
    updateCharacter(activeId, patch)
    refresh()
  }, [activeId, refresh])

  const handleStatChange = useCallback((statName, field, value) => {
    if (!activeId) return
    updateCharacterStat(activeId, statName, field, value)
    refresh()
  }, [activeId, refresh])

  const handleSkillChange = useCallback((skillName, field, value) => {
    if (!activeId) return
    updateSkill(activeId, skillName, field, value)
    refresh()
  }, [activeId, refresh])

  const handleSpellListChange = useCallback((listName, ranks) => {
    if (!activeId) return
    updateSpellList(activeId, listName, ranks)
    refresh()
  }, [activeId, refresh])

  const handleAddWeapon    = useCallback((patch) => { if (activeId) { addWeapon(activeId, patch); refresh() } }, [activeId, refresh])
  const handleUpdateWeapon = useCallback((wId, p) => { if (activeId) { updateWeapon(activeId, wId, p); refresh() } }, [activeId, refresh])
  const handleRemoveWeapon = useCallback((wId) => { if (activeId) { removeWeapon(activeId, wId); refresh() } }, [activeId, refresh])
  const handleArmorPart    = useCallback((part, p) => { if (activeId) { updateArmorPart(activeId, part, p); refresh() } }, [activeId, refresh])

  const handleAddEquip    = useCallback((item) => { if (activeId) { addEquipmentItem(activeId, item); refresh() } }, [activeId, refresh])
  const handleUpdateEquip = useCallback((eId, p) => { if (activeId) { updateEquipmentItem(activeId, eId, p); refresh() } }, [activeId, refresh])
  const handleRemoveEquip = useCallback((eId) => { if (activeId) { removeEquipmentItem(activeId, eId); refresh() } }, [activeId, refresh])

  const handleAddMagic    = useCallback(() => { if (activeId) { addMagicItem(activeId); refresh() } }, [activeId, refresh])
  const handleUpdateMagic = useCallback((mId, p) => { if (activeId) { updateMagicItem(activeId, mId, p); refresh() } }, [activeId, refresh])
  const handleRemoveMagic = useCallback((mId) => { if (activeId) { removeMagicItem(activeId, mId); refresh() } }, [activeId, refresh])

  const handleAddCustomSkill    = useCallback((tmpl, label) => { if (activeId) { addCustomSkill(activeId, tmpl, label); refresh() } }, [activeId, refresh])
  const handleUpdateCustomSkill = useCallback((csId, p) => { if (activeId) { updateCustomSkill(activeId, csId, p); refresh() } }, [activeId, refresh])
  const handleRemoveCustomSkill = useCallback((csId) => { if (activeId) { removeCustomSkill(activeId, csId); refresh() } }, [activeId, refresh])

  const handleRemoveSpellList = useCallback((listName) => { if (activeId) { removeSpellList(activeId, listName); refresh() } }, [activeId, refresh])

  const handleAddTalent    = useCallback((tId, tier, param) => { if (activeId) { addTalent(activeId, tId, tier, param); refresh() } }, [activeId, refresh])
  const handleUpdateTalent = useCallback((instId, p) => { if (activeId) { updateTalent(activeId, instId, p); refresh() } }, [activeId, refresh])
  const handleRemoveTalent = useCallback((instId) => { if (activeId) { removeTalent(activeId, instId); refresh() } }, [activeId, refresh])

  const activeChar = activeId ? characters[activeId] : null

  const ctx = {
    characters, activeId, activeChar,
    switchCharacter,
    reloadCharacters: refresh,
    createCharacter: handleCreate,
    deleteCharacter: handleDelete,
    updateCharacter: handleUpdate,
    updateStat: handleStatChange,
    updateSkill: handleSkillChange,
    updateSpellList: handleSpellListChange,
    addWeapon: handleAddWeapon,
    updateWeapon: handleUpdateWeapon,
    removeWeapon: handleRemoveWeapon,
    updateArmorPart: handleArmorPart,
    addEquipment: handleAddEquip,
    updateEquipment: handleUpdateEquip,
    removeEquipment: handleRemoveEquip,
    addMagicItem: handleAddMagic,
    updateMagicItem: handleUpdateMagic,
    removeMagicItem: handleRemoveMagic,
    addCustomSkill: handleAddCustomSkill,
    updateCustomSkill: handleUpdateCustomSkill,
    removeCustomSkill: handleRemoveCustomSkill,
    removeSpellList: handleRemoveSpellList,
    addTalent: handleAddTalent,
    updateTalent: handleUpdateTalent,
    removeTalent: handleRemoveTalent,
  }

  return (
    <CharacterContext.Provider value={ctx}>
      <Shell>
        <Routes>
          <Route path="/"          element={activeChar ? <Navigate to="/sheet" replace /> : <WelcomeView />} />
          <Route path="/sheet"     element={activeChar ? <CharacterSheet /> : <WelcomeView />} />
          <Route path="/skills"    element={activeChar ? <SkillsView />    : <WelcomeView />} />
          <Route path="/spells"    element={<SpellsView />} />
          <Route path="/levelup"   element={activeChar ? <LevelUpView />  : <WelcomeView />} />
          <Route path="/reference" element={<ReferenceView />} />
          <Route path="/gear"      element={activeChar ? <EquipmentView /> : <WelcomeView />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </CharacterContext.Provider>
  )
}
