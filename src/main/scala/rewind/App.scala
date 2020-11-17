package rewind

import scala.concurrent.ExecutionContext

import cats.effect.{IO, IOApp, ExitCode}
import org.http4s.server.blaze._
import org.http4s.server.middleware._
import org.http4s.server.Router
import org.http4s.client.blaze._
import org.http4s.client.middleware.FollowRedirect
import org.http4s.implicits._

import services._

object App extends IOApp {

  override def run(args: List[String]): IO[ExitCode] = {
    val conf = Conf.get

    val ec = ExecutionContext.global

    BlazeClientBuilder[IO](ec).resource.use { client =>
      val app = Router(
        "/" -> GribService.make(FollowRedirect(1)(client), conf.gribStorage)
      ).orNotFound

      BlazeServerBuilder[IO](ec).withoutBanner
        .bindHttp(conf.http.port, conf.http.address)
        .withHttpApp(Logger.httpApp(logBody = false, logHeaders = true)(app))
        .serve
        .compile
        .drain
        .as(ExitCode.Success)
    }
  }

}
