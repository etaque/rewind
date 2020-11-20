package rewind.stores

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import scala.util.{Left, Right}

import cats.implicits._
import cats.effect.IO
import org.http4s._
import org.http4s.client.Client
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.auth.{BasicAWSCredentials, AWSStaticCredentialsProvider}
import org.slf4j.LoggerFactory

import rewind.Conf.ObjectStorage

class GribStore(httpClient: Client[IO], storageConf: ObjectStorage) {
  val logger = LoggerFactory.getLogger("GribStore")

  val awsCreds = new BasicAWSCredentials(storageConf.keyId, storageConf.secret);
  val s3 =
    AmazonS3ClientBuilder
      .standard()
      .withCredentials(new AWSStaticCredentialsProvider(awsCreds))
      .withRegion(storageConf.region)
      .build()

  def syncAt(date: LocalDate, hour: Int, force: Boolean): IO[String] = {
    val noaaUri = GribStore.noaaUri(date, hour)
    exists(date, hour).flatMap { alreadyThere =>
      val filename = GribStore.filename(date, hour)
      if (alreadyThere && !force) {
        IO(logger.info(s"Skipping, file already synced")).map(_ => filename)
      } else {
        for {
          _ <- IO(
            logger.info(s"Downloading NOAA file on $date at $hour: $noaaUri"))
          content <- httpClient.expect[String](noaaUri)
          _ <- IO(logger.info(s"Download successful, uploading to $filename"))
          _ <- IO(s3.putObject(storageConf.bucket, filename, content))
          _ <- IO(logger.info(s"Upload successful to $filename"))
        } yield filename
      }
    }
  }

  def syncOn(date: LocalDate, force: Boolean): IO[List[String]] = {
    for {
      _ <- IO(logger.info(s"Starting sync on $date"))
      names <- 0.to(3).map(_ * 6).toList.traverse { hour =>
        syncAt(date, hour, force)
      }
      _ <- IO(logger.info(s"Finished sync on $date"))
    } yield names
  }

  def exists(date: LocalDate, hour: Int): IO[Boolean] = {
    IO(s3.getObjectMetadata(storageConf.bucket, GribStore.filename(date, hour))).attempt
      .map {
        case Left(_)  => false
        case Right(_) => true
      }
  }
}

object GribStore {
  def filename(date: LocalDate, hour: Int): String = {
    val fday = date.format(DateTimeFormatter.BASIC_ISO_DATE)
    val fhour = f"$hour%02d"
    s"gfs-1p00/$fday-$fhour.grib2"
  }

  def noaaUri(date: LocalDate, hour: Int): Uri = {
    val fday = date.format(DateTimeFormatter.BASIC_ISO_DATE)
    val fhour = f"$hour%02d"
    Uri
      .fromString(
        s"http://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.${fday}/${fhour}/gfs.t${fhour}z.pgrb2.1p00.f000")
      .getOrElse(sys.error("Failed to build GRIB URL."))
  }
}
