const ADJECTIVES = [
  "Salty",
  "Swift",
  "Storm",
  "Wild",
  "Iron",
  "Bold",
  "Mad",
  "Lone",
  "Rusty",
  "Lucky",
  "Grim",
  "Rogue",
  "Silent",
  "Daring",
  "Fearless",
];

const NOUNS = [
  "Mariner",
  "Albatross",
  "Wave",
  "Tide",
  "Gale",
  "Sailor",
  "Anchor",
  "Compass",
  "Helm",
  "Reef",
  "Kraken",
  "Shark",
  "Pelican",
  "Dolphin",
  "Orca",
];

export function generateNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}
