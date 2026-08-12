/**
 * Un match naît quand *tous* les membres du salon ont aimé le film.
 *
 * Écrit pour N membres plutôt que pour 2 : cela ne coûte rien aujourd'hui et
 * permettra d'inviter des amis sans réécriture. Le garde-fou sur la taille du
 * salon empêche une personne seule de matcher avec elle-même.
 */
export function shouldCreateMatch(
  memberIds: string[],
  likedByMemberIds: Iterable<string>,
): boolean {
  if (memberIds.length < 2) return false
  const liked = new Set(likedByMemberIds)
  return memberIds.every((id) => liked.has(id))
}
