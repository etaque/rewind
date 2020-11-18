package rewind.services

import cats.effect.IO

import org.http4s._
import org.http4s.dsl.io._
import org.http4s.client.Client

import rewind.Conf.ObjectStorage
import rewind.stores._
import helpers.LocalDateVar

object GribService {

  def make(httpClient: Client[IO], gribConf: ObjectStorage) = {
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
}
