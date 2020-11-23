package rewind.stores

import scala.util.Using
import scala.io.Source

import rewind.models.Polar

object PolarStore {

  val imocaPath = "polar/imoca_60_foils.csv"
  lazy val current = load(imocaPath)

  def load(path: String): Polar = {
    val matrix: Seq[Seq[String]] = Using.resource(Source.fromResource(path))(
      _.getLines().map(_.split(";").toSeq).toSeq
    )
    Polar.fromMatrix(matrix)
  }

}
