/**
 * Tunable gameplay constants. Everything is in world units:
 * 1 unit = 1 terrain pixel, time in seconds. The world is a fixed
 * WORLD_W x WORLD_H rectangle; the renderer scales it to the screen.
 */
export const WORLD_W = 960;
export const WORLD_H = 540;
/** Anything whose feet / position goes below this line has fallen into the water. */
export const WATER_Y = 505;

/** Fixed simulation step (s). Game + AI preview use the same step so predictions match. */
export const STEP = 1 / 120;

/** Gravity applied to projectiles and airborne characters (units/s²). */
export const GRAVITY = 420;
/** Launch speed at power = 1 (units/s). */
export const MAX_LAUNCH_SPEED = 560;
/** Max absolute wind acceleration (units/s²) rolled each turn; affects projectiles only. */
export const MAX_WIND = 45;

/** Character body. Position (x, y) is the bottom-centre pixel of the body (the feet). */
export const CHAR_HALF_W = 6;
export const CHAR_H = 20;
export const MAX_HP = 100;
/** Horizontal walk speed (units/s) and walk distance allowed per turn (units). */
export const WALK_SPEED = 70;
export const MOVE_BUDGET = 110;
/** Max step height a character can climb while walking (units). */
export const MAX_STEP_UP = 7;

/** Fireball weapon. */
export const CRATER_RADIUS = 28;
export const BLAST_RADIUS = 58;
export const MAX_DAMAGE = 42;
export const KNOCKBACK = 260;
/** Hit radius for a projectile touching a character (centre distance). */
export const HIT_RADIUS = 11;

/** Distance from the character (screen tap) that maps to full power. */
export const AIM_FULL_POWER_DIST = 220;
/** Shooter is immune to its own projectile for this long after firing (s). */
export const SELF_HIT_GRACE = 0.2;
/** Fall speed (units/s) above which landing hurts, and damage per extra unit/s. */
export const FALL_DAMAGE_SPEED = 380;
export const FALL_DAMAGE_PER_SPEED = 0.12;
