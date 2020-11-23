package rewind.utils

object Geo {
  def mpsToKnot(mps: Double): Double = mps / 1.852 / 1000 * 3600
  def knotToMps(knot: Double): Double = knot * 1.852 * 1000 / 3600

  def ensureDegrees(d: Double) = d % 360
  def degreesToAzimuth(d: Double) = if (d > 180) d - 360 else d
  def azimuthToDegrees(a: Double) = if (a < 0) a + 360 else a

  def roundN(d: Double, precision: Int) =
    (d * math.pow(10, precision)).round.toDouble / math.pow(10, precision)
  def round1(d: Double) = roundN(d, 1)
  def round2(d: Double) = roundN(d, 2)
}
