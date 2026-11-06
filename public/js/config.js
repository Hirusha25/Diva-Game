// Tunable game constants. Distances are metres, speeds metres/second.

export const LANE_WIDTH = 2.5;
export const LANE_COUNT = 3;
export const ROAD_HALF = (LANE_WIDTH * LANE_COUNT) / 2; // 3.75

// Cross-section of the street, measured from the road centre line outward.
// These match the bus-shelter model so shelters sit flush on the pavement.
export const KERB = { inner: ROAD_HALF, outer: 4.05, height: 0.24 };
export const PAVEMENT = { inner: 4.0, outer: 6.26, height: 0.135 };
export const WALL = { inner: 6.26, outer: 6.56, height: 2.2 };
export const SHELTER_OFFSET_X = 4.98; // shelter origin → its kerb edge lands on the road edge

export const CHUNK_LENGTH = 60;
export const CHUNK_COUNT = 4;

export const SPEED = { lobby: 4, start: 14, max: 32, ramp: 0.35 };   // faster start, quicker ramp, higher top speed
export const LANE_SWITCH_SPEED = 12;  // metres/second sideways (keeps up with the higher run speed)
export const JUMP = { height: 1.5, duration: 0.55 };

export const LIVES = 3;
export const SCORE_PICKUP = 10;
export const SCORE_PER_METRE = 0.5;
export const INVULNERABLE_TIME = 1.6;

export const COLORS = {
  // Sampled from the reference concept art, zenith to horizon.
  skyTop: 0x0167f2,
  skyMid: 0x0c93fe,
  skyLow: 0x3bb8fe,
  skyLow2: 0x9fe7fc,
  skyHorizon: 0xdaf3f8,
  fog: 0xdaf3f8,
  asphaltTint: 0xe6e6e6,
  laneLine: 0xf6f6f2,
  kerbWhite: 0xf3f3ee,
  kerbBlack: 0x262626,
  pavement: 0xffffff,      // tinted by the paving texture
  wall: 0xfcdc65,        // sampled from the reference (sunlit face)
  wallShade: 0xe0b848,   // faces turned away from the sun
  wallCap: 0xd6a485,     // coping front, sampled
  wallCapTop: 0xe9d3c0,  // coping top, lighter
  ground: 0x5a9a2e,
  dirt: 0x8d7a4e,
  shrub: 0x3f9a2f,
  shrubLight: 0x6cc24a,
  flowerPink: 0xff4fa3,
  flowerWhite: 0xffffff,
  trunk: 0x6b4a2b,
};
