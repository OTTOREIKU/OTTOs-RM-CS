import { createContext, useContext } from 'react'

export const CharacterContext = createContext(null)

export function useCharacter() {
  return useContext(CharacterContext)
}
