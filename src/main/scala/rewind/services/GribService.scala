package rewind.services

import scala.concurrent.duration._
import java.time.LocalDateTime

import cats.effect.{IO, Timer}
import org.http4s._
import org.http4s.dsl.io._
import org.http4s.client.Client
import fs2.Stream
import org.slf4j.LoggerFactory

import rewind.Conf.ObjectStorage
import rewind.stores._
import helpers.LocalDateVar

object GribService {
  val logger = LoggerFactory.getLogger("GribService")

  def routes(httpClient: Client[IO], gribConf: ObjectStorage) = {
    val gribStore = new GribStore(httpClient, gribConf)

    HttpRoutes.of[IO] {

      case PUT -> Root / "gribs" / "sync-at" / LocalDateVar(date) / IntVar(
            hour) =>
        gribStore.syncAt(date, hour).flatMap { filename =>
          Ok("Done: " + filename)
        }

      case PUT -> Root / "gribs" / "sync-on" / LocalDateVar(date) =>
        gribStore.syncOn(date).flatMap { filenames =>
          Ok("Done: " + filenames.mkString(", "))
        }

    }
  }

  def dailySync(httpClient: Client[IO], gribConf: ObjectStorage)(
      implicit timer: Timer[IO]): Stream[IO, List[String]] = {
    val gribStore = new GribStore(httpClient, gribConf)

    Stream
      .awakeEvery[IO](1.hour)
      .evalMap { _ =>
        logger.info("Daily sync loop")
        IO(LocalDateTime.now).flatMap { now =>
          if (now.getHour() == 2) {
            gribStore.syncOn(now.minusDays(1).toLocalDate())
          } else {
            IO(Nil)
          }
        }
      }
  }
}
