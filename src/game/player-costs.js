export function signingFee(player) {
  const average = (player.aim + player.intelligence + player.stamina) / 3;
  return Math.round(average * average * 2 / 100) * 100;
}
