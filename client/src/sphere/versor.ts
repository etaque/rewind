// From https://github.com/d3/versor/blob/master/src/index.js

const acos = Math.acos,
  asin = Math.asin,
  atan2 = Math.atan2,
  cos = Math.cos,
  sqrt = Math.sqrt,
  max = Math.max,
  min = Math.min,
  PI = Math.PI,
  sin = Math.sin,
  radians = PI / 180,
  degrees = 180 / PI;

export type Cartesian = [x: number, y: number, z: number];
export type Euler = [lambda: number, phi: number, gamma: number];
export type Versor = [a: number, b: number, c: number, d: number];
export type Spherical = [alpha: number, gamma: number];

// Returns the unit quaternion for the given Euler rotation angles [λ, φ, γ].
export const versor = function (e: Euler): Versor {
  var l = (e[0] / 2) * radians,
    sl = sin(l),
    cl = cos(l), // λ / 2
    p = (e[1] / 2) * radians,
    sp = sin(p),
    cp = cos(p), // φ / 2
    g = (e[2] / 2) * radians,
    sg = sin(g),
    cg = cos(g); // γ / 2
  return [
    cl * cp * cg + sl * sp * sg,
    sl * cp * cg - cl * sp * sg,
    cl * sp * cg + sl * cp * sg,
    cl * cp * sg - sl * sp * cg,
  ];
};

// Returns Cartesian coordinates [x, y, z] given spherical coordinates [λ, φ].
export const cartesian = function (e: Spherical): Cartesian {
  var l = e[0] * radians,
    p = e[1] * radians,
    cp = cos(p);
  return [cp * cos(l), cp * sin(l), sin(p)];
};

// Returns the Euler rotation angles [λ, φ, γ] for the given quaternion.
export const rotation = function (q: Versor): Euler {
  return [
    atan2(
      2 * (q[0] * q[1] + q[2] * q[3]),
      1 - 2 * (q[1] * q[1] + q[2] * q[2])
    ) * degrees,
    asin(max(-1, min(1, 2 * (q[0] * q[2] - q[3] * q[1])))) * degrees,
    atan2(
      2 * (q[0] * q[3] + q[1] * q[2]),
      1 - 2 * (q[2] * q[2] + q[3] * q[3])
    ) * degrees,
  ];
};

// Returns the quaternion to rotate between two cartesian points on the sphere.
// alpha for tweening [0,1]
export const delta = function (
  v0: Cartesian,
  v1: Cartesian,
  alpha: number = 1
): Versor {
  var w = cross(v0, v1),
    l = sqrt(dot(w, w));
  if (!l) return [1, 0, 0, 0];
  var t = (alpha * acos(max(-1, min(1, dot(v0, v1))))) / 2,
    s = sin(t); // t = θ / 2
  return [cos(t), (w[2] / l) * s, (-w[1] / l) * s, (w[0] / l) * s];
};

// Returns the quaternion that represents q0 * q1.
export const multiply = function (q0: Versor, q1: Versor): Versor {
  return [
    q0[0] * q1[0] - q0[1] * q1[1] - q0[2] * q1[2] - q0[3] * q1[3],
    q0[0] * q1[1] + q0[1] * q1[0] + q0[2] * q1[3] - q0[3] * q1[2],
    q0[0] * q1[2] - q0[1] * q1[3] + q0[2] * q1[0] + q0[3] * q1[1],
    q0[0] * q1[3] + q0[1] * q1[2] - q0[2] * q1[1] + q0[3] * q1[0],
  ];
};

function cross(v0: Cartesian, v1: Cartesian): Cartesian {
  return [
    v0[1] * v1[2] - v0[2] * v1[1],
    v0[2] * v1[0] - v0[0] * v1[2],
    v0[0] * v1[1] - v0[1] * v1[0],
  ];
}

function dot(v0: Cartesian, v1: Cartesian): number {
  return v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
}
