package rewind.stores

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import cats.implicits._
import cats.effect.IO
import org.http4s._
import org.http4s.client.Client
import com.amazonaws.services.s3.AmazonS3ClientBuilder

import rewind.Conf.ObjectStorage

class GribStore(httpClient: Client[IO], storageConf: ObjectStorage) {
  val s3 =
    AmazonS3ClientBuilder.standard().withRegion(storageConf.region).build()

  def syncAt(date: LocalDate, hour: Int): IO[String] = {
    httpClient.expect[String](GribStore.noaaUri(date, hour)).flatMap {
      content =>
        val filename = GribStore.filename(date, hour)
        IO {
          s3.putObject(storageConf.bucket, filename, content)
          filename
        }
    }
  }

  def syncOn(date: LocalDate): IO[List[String]] = {
    0.to(3).map(_ * 6).toList.traverse { hour =>
      syncAt(date, hour)
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
