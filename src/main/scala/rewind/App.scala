package rewind

import scala.concurrent.ExecutionContext

import cats.implicits._
import cats.effect.{IO, IOApp, ExitCode, Resource, Blocker}
import org.http4s._
import org.http4s.dsl.io._
import org.http4s.server.blaze._
import org.http4s.server.middleware._
import org.http4s.server.Router
import org.http4s.client.blaze._
import org.http4s.client.middleware.FollowRedirect
import org.http4s.implicits._
import doobie._
import doobie.hikari._
import doobie.implicits._

import services._
import stores.PolarStore

object App extends IOApp {

  override def run(args: List[String]): IO[ExitCode] = {
    val conf = Conf.get

    val ec = ExecutionContext.global

    BlazeClientBuilder[IO](ec).resource.use { baseClient =>
      val httpClient = FollowRedirect(1)(baseClient)

      makeTransactor(conf.db).use { implicit xa =>
        val apiService = rootService <+> GribService.routes(httpClient, conf)

        val app = Router(
          "/" -> apiService
        ).orNotFound

        BlazeServerBuilder[IO](ec).withoutBanner
          .bindHttp(conf.http.port, conf.http.address)
          .withHttpApp(Logger.httpApp(logBody = false, logHeaders = true)(app))
          .serve
          .concurrently(GribService.dailySync(httpClient, conf))
          .compile
          .drain
          .as(ExitCode.Success)
      }
    }
  }

  def rootService(implicit xa: Transactor[IO]) = HttpRoutes.of[IO] {
    case GET -> Root =>
      sql"SELECT 42".query[Int].unique.transact(xa).flatMap { _ =>
        Ok("Hello world")
      }

    case GET -> Root / "polar" / windSpeed / IntVar(windAngle) =>
      Ok(
        utils.Geo
          .mpsToKnot(PolarStore.current.getSpeed(windSpeed.toDouble, windAngle))
          .toString)
  }

  def makeTransactor(dbConf: Conf.DB): Resource[IO, HikariTransactor[IO]] =
    for {
      connectEC <- ExecutionContexts.fixedThreadPool[IO](
        Runtime
          .getRuntime()
          .availableProcessors() * 2 + 1) // await JDBC connection
      transactEC <- ExecutionContexts
        .cachedThreadPool[IO] // execute JDBC operations
      xa <- HikariTransactor.newHikariTransactor[IO](
        driverClassName = "org.postgresql.Driver",
        url = dbConf.uri,
        user = dbConf.user,
        pass = dbConf.password.getOrElse(""),
        connectEC = connectEC,
        blocker = Blocker.liftExecutionContext(transactEC)
      )
    } yield xa

}
