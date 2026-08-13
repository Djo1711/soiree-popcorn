/**
 * Un match naît quand *tous* les membres du salon ont aimé le film.
 *
 * Écrit pour N membres plutôt que pour 2 : cela ne coûte rien aujourd'hui et
 * permettra d'inviter des amis sans réécriture. Le garde-fou sur la taille du
 * salon empêche une personne seule de matcher avec elle-même. Les identifiants
 * sont dédupliqués avant le comptage, de sorte qu'un identifiant dupliqué ne
 * peut pas feindre l'adhésion d'un deuxième participant.
 */
export function shouldCreateMatch(
  memberIds: string[],
  likedByMemberIds: Iterable<string>,
): boolean {
  const membresDistincts = new Set(memberIds)
  if (membresDistincts.size < 2) return false
  const liked = new Set(likedByMemberIds)
  return Array.from(membresDistincts).every((id) => liked.has(id))
}
