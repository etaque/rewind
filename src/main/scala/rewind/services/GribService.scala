package rewind.services

import cats.effect.IO

import org.http4s._
import org.http4s.dsl.io._
import org.http4s.client.Client

import com.amazonaws.services.s3.AmazonS3ClientBuilder

import rewind.Conf.ObjectStorage

object GribService {

  def make(httpClient: Client[IO], gribConf: ObjectStorage) = {
    val s3 =
      AmazonS3ClientBuilder.standard().withRegion(gribConf.region).build()

    HttpRoutes.of[IO] {
      case GET -> Root / "gribs" =>
        Ok("Hello world")

      case PUT -> Root / "gribs" / date / hour =>
        val uri = Uri
          .fromString(
            s"http://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.${date}/${hour}/gfs.t${hour}z.pgrb2.1p00.f000")
          .getOrElse(sys.error("Failed to build GRIB URL."))

        println(uri)

        for {
          content <- httpClient.expect[String](uri)
          _ <- IO(
            s3.putObject(gribConf.bucket,
                         s"gfs-1p00/${date}-${hour}.grib2",
                         content))
          res <- Ok("Done")

        } yield res

    }
  }
}
