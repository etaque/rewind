package rewind.services

import java.time.LocalDate
import scala.util.Try

object helpers {

  object LocalDateVar {
    def unapply(str: String): Option[LocalDate] = {
      if (!str.isEmpty)
        Try(LocalDate.parse(str)).toOption
      else
        None
    }
  }

}
