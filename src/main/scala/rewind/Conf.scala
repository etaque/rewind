package rewind

import pureconfig._
import pureconfig.generic.auto._
import scala.util.{Left, Right}

object Conf {

  case class Root(
      http: Http,
      db: DB,
      gribStorage: ObjectStorage,
  )

  case class Http(
      port: Int,
      address: String
  )

  case class DB(
      uri: String,
      user: String,
      password: Option[String]
  )

  case class ObjectStorage(
      region: String,
      bucket: String
  )

  lazy val get = ConfigSource.default.load[Root] match {
    case Right(conf) =>
      conf
    case Left(error) =>
      sys.error(s"Unable to load conf:\n- ${error.toList.mkString(",\n- ")}.")
  }
}
