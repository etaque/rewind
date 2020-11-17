package rewind.services

import cats.effect.IO

import org.http4s._
import org.http4s.dsl.io._

object GribService {
  def make = HttpRoutes.of[IO] {
    case GET -> Root / "gribs" =>
      Ok("Hello world")

    case POST -> Root / "gribs" / "transfer" / date / hour =>
      NotImplemented("TODO")
  }
}
