package rewind.services

import scala.concurrent.duration._
import java.time.LocalDateTime

import cats.effect.{IO, Timer}
import org.http4s._
import org.http4s.dsl.io._
import org.http4s.client.Client
import fs2.Stream
import org.slf4j.LoggerFactory
import doobie.Transactor
import doobie.implicits._

import rewind.Conf
import rewind.stores._
import helpers.LocalDateVar

object GribService {
  val logger = LoggerFactory.getLogger("GribService")

  def routes(httpClient: Client[IO], conf: Conf.Root) = {
    val gribStore = new GribStore(httpClient, conf.gribStorage)

    HttpRoutes.of[IO] {

      case PUT -> Root / "gribs" / "sync-at" / LocalDateVar(date) / IntVar(
            hour) =>
        gribStore.syncAt(date, hour, force = true).flatMap { filename =>
          Ok("Done: " + filename)
        }

      case PUT -> Root / "gribs" / "sync-on" / LocalDateVar(date) =>
        gribStore.syncOn(date, force = true).flatMap { filenames =>
          Ok("Done: " + filenames.mkString(", "))
        }

    }
  }

  def dailySync(httpClient: Client[IO], conf: Conf.Root)(
      implicit xa: Transactor[IO],
      timer: Timer[IO]): Stream[IO, List[String]] = {
    val gribStore = new GribStore(httpClient, conf.gribStorage)

    if (conf.sync.enabled.contains(true)) {
      Stream
        .awakeEvery[IO](1.day)
        .evalMap { _ =>
          logger.info("Daily sync loop")
          IO(LocalDateTime.now).flatMap { now =>
            if (now.getHour() == 2) {
              grabLock().flatMap { hasLock =>
                if (hasLock) {
                  for {
                    _ <- IO(logger.info("Lock grabbed, syncing..."))
                    filenames <- gribStore.syncOn(
                      now.minusDays(1).toLocalDate(),
                      force = false)
                    _ <- releaseLock()
                    _ <- IO(logger.info("Lock released."))
                    _ <- conf.sync.healthcheck
                      .map(httpClient.expect[String])
                      .getOrElse(IO(""))
                  } yield filenames
                } else {
                  IO(logger.info("Unable to grab lock, skipping.")).map(_ =>
                    Nil)
                }
              }
            } else {
              IO(logger.info("Not time to sync, skipping.")).map(_ => Nil)
            }
          }
        }
    } else {
      Stream.empty
    }
  }

  val SyncLockId = 1

  def grabLock()(implicit xa: Transactor[IO]): IO[Boolean] = {
    sql"select pg_try_advisory_lock($SyncLockId)"
      .query[Boolean]
      .unique
      .transact(xa)
  }

  def releaseLock()(implicit xa: Transactor[IO]): IO[Boolean] = {
    sql"select pg_advisory_unlock($SyncLockId)"
      .query[Boolean]
      .unique
      .transact(xa)
  }

}
