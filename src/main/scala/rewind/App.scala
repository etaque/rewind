package rewind

import scala.concurrent.ExecutionContext

import cats.effect.{IO, IOApp, ExitCode}
import org.http4s.server.blaze._
import org.http4s.server.Router
import org.http4s.implicits._

import services._

object App extends IOApp {

  override def run(args: List[String]): IO[ExitCode] = {
    val conf = Conf.get

    val ec = ExecutionContext.global

    val app = Router(
      "/" -> GribService.make
    ).orNotFound

    BlazeServerBuilder[IO](ec).withoutBanner
      .bindHttp(conf.http.port, conf.http.address)
      .withHttpApp(app)
      .serve
      .compile
      .drain
      .as(ExitCode.Success)
  }

}
