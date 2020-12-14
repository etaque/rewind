module Model exposing (..)

import Iso8601
import Json.Decode as JD exposing (Decoder, float, int, string, succeed)
import Json.Decode.Pipeline exposing (hardcoded, optional, required)
import Json.Encode as JE
import Time exposing (Posix)


type alias LngLat =
    { lng : Float
    , lat : Float
    }


lngLatDecoder : Decoder LngLat
lngLatDecoder =
    succeed LngLat
        |> required "lng" float
        |> required "lat" float


encodeLngLat : LngLat -> JE.Value
encodeLngLat { lng, lat } =
    JE.object [ ( "lng", JE.float lng ), ( "lat", JE.float lat ) ]


type alias WindPoint =
    { position : LngLat
    , u : Float
    , v : Float
    }


windPointDecoder : Decoder WindPoint
windPointDecoder =
    succeed WindPoint
        |> required "position" lngLatDecoder
        |> required "u" float
        |> required "v" float


type alias WindReport =
    { time : Posix
    , closest : WindPoint
    , all : List WindPoint
    }


windReportDecoder : Decoder WindReport
windReportDecoder =
    succeed WindReport
        |> required "time" (int |> JD.map Time.millisToPosix)
        |> required "closest" windPointDecoder
        |> required "all" (JD.list windPointDecoder)


type alias Course =
    { key : String
    , name : String
    , startTime : Posix
    , start : LngLat
    , finish : LngLat
    , timeFactor : Int
    }


vg20 : Course
vg20 =
    let
        parseTime =
            Iso8601.toTime >> Result.withDefault (Time.millisToPosix 0)

        lsd =
            LngLat 46.470243284275966 -1.788456535301071
    in
    { key = "vg20"
    , name = "Vendée Globe 2020"
    , startTime = parseTime "2020-11-08T11:00:00+01:00"
    , start = lsd
    , finish = lsd
    , timeFactor = 100
    }
