export const MIN_MEMBERS = 2
export const MAX_MEMBERS = 8

export interface MatchRule {
  /** Effectif annoncé à la création du salon, entre MIN_MEMBERS et MAX_MEMBERS. */
  expectedMembers: number
  /** Nombre de « j'aime » requis, entre MIN_MEMBERS et expectedMembers. */
  threshold: number
}

/**
 * Un match naît quand deux conditions sont réunies : l'effectif annoncé est au
 * complet, et le nombre de membres ayant aimé le film atteint le seuil.
 *
 * Les identifiants sont dédoublonnés avant d'être comptés, pour qu'un doublon
 * ne puisse pas faire passer une personne pour deux participants.
 *
 * Le seuil existe parce que l'unanimité ne passe pas à l'échelle : à huit
 * personnes aimant chacune 40 % des films, elle survient dans 0,07 % des cas.
 * Son plancher de 2 empêche qu'un seul avis décide pour le groupe.
 */
export function shouldCreateMatch(
  memberIds: string[],
  likedByMemberIds: Iterable<string>,
  rule: MatchRule,
): boolean {
  const { expectedMembers, threshold } = rule

  if (!Number.isInteger(expectedMembers) || !Number.isInteger(threshold)) return false
  if (expectedMembers < MIN_MEMBERS || expectedMembers > MAX_MEMBERS) return false
  if (threshold < MIN_MEMBERS || threshold > expectedMembers) return false

  const membresDistincts = new Set(memberIds)
  if (membresDistincts.size !== expectedMembers) return false

  const liked = new Set(likedByMemberIds)
  let votes = 0
  for (const id of membresDistincts) {
    if (liked.has(id)) votes++
  }
  return votes >= threshold
}
