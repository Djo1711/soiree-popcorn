import type { MatchRow } from '@/lib/db/queries/matches'
import type { MemberSummary, RoomSummary } from '@/lib/db/queries/rooms'

export interface EtatSalon {
  room: RoomSummary | null
  members: MemberSummary[]
  matches: MatchRow[]
  curseur: number
  pretAffiche: boolean
  sansSession: boolean
  moi: MemberSummary | null
}

export const ETAT_INITIAL: EtatSalon = {
  room: null,
  members: [],
  matches: [],
  curseur: 0,
  pretAffiche: false,
  sansSession: false,
  moi: null,
}

export function fusionnerEvenements(
  etat: EtatSalon,
  reponse: { room: RoomSummary; members: MemberSummary[]; matches: MatchRow[]; moi: MemberSummary | null },
): EtatSalon {
  const curseur = reponse.matches.reduce((max, m) => Math.max(max, m.matchId), etat.curseur)
  return {
    room: reponse.room,
    members: reponse.members,
    matches: [...etat.matches, ...reponse.matches],
    curseur,
    pretAffiche: true,
    sansSession: false,
    moi: reponse.moi,
  }
}
