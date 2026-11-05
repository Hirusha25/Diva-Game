// Tunable game constants. Distances are metres, speeds metres/second.

export const LANE_WIDTH = 2.5;
export const LANE_COUNT = 3;
export const ROAD_HALF = (LANE_WIDTH * LANE_COUNT) / 2; // 3.75

// Cross-section of the street, measured from the road centre line outward.
// These match the bus-shelter model so shelters sit flush on the pavement.
export const KERB = { inner: ROAD_HALF, outer: 4.0, height: 0.16 };
export const PAVEMENT = { inner: 4.0, outer: 6.26, height: 0.135 };
export const WALL = { inner: 6.26, outer: 6.56, height: 2.2 };
export const SHELTER_OFFSET_X = 4.98; // shelter origin → its kerb edge lands on the road edge

export const CHUNK_LENGTH = 60;
export const CHUNK_COUNT = 4;

export const SPEED = { lobby: 4, start: 9, max: 24, ramp: 0.18 };
export const LANE_SWITCH_SPEED = 9;   // metres/second sideways
export const JUMP = { height: 1.5, duration: 0.65 };

export const LIVES = 3;
export const SCORE_PICKUP = 10;
export const SCORE_PER_METRE = 0.5;
export const INVULNERABLE_TIME = 1.6;

export const COLORS = {
  skyTop: 0x2f8fe8,
  skyHorizon: 0xd7ecff,
  fog: 0xcfe4f7,
  asphaltTint: 0xb8bcc0,
  laneLine: 0xf2f2ec,
  kerbWhite: 0xe5e5e1,
  kerbBlack: 0x2a2a2a,
  pavement: 0x8c8d89,
  wall: 0xd5c179,
  wallCap: 0x76726a,
  ground: 0x7c9a4b,
  dirt: 0xa08a5c,
};
