module Model exposing (..)

import Iso8601
import Json.Decode as JD exposing (Decoder, float, int, string, succeed)
import Json.Decode.Pipeline exposing (required)
import Json.Encode as JE
import Time
import UUID exposing (UUID)


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


type alias WindForce =
    { u : Float
    , v : Float
    }


windForceDecoder : Decoder WindForce
windForceDecoder =
    succeed WindForce
        |> required "u" float
        |> required "v" float


type alias WindReport =
    { id : UUID
    , time : Int
    }


windReportDecoder : Decoder WindReport
windReportDecoder =
    succeed WindReport
        |> required "id" UUID.jsonDecoder
        |> required "time" int


windReportsDecoder : Decoder (List WindReport)
windReportsDecoder =
    JD.list windReportDecoder


encodeWindReport : WindReport -> JE.Value
encodeWindReport { id, time } =
    JE.object
        [ ( "id", UUID.toValue id )
        , ( "time", JE.int time )
        ]


type alias Course =
    { key : String
    , name : String
    , startTime : Int
    , start : LngLat
    , finish : LngLat
    , timeFactor : Float
    }


encodeCourse : Course -> JE.Value
encodeCourse c =
    JE.object
        [ ( "key", JE.string c.key )
        , ( "name", JE.string c.name )
        , ( "startTime", JE.int c.startTime )
        , ( "start", encodeLngLat c.start )
        , ( "finish", encodeLngLat c.finish )
        , ( "timeFactor", JE.float c.timeFactor )
        ]


vg20 : Course
vg20 =
    let
        parseTime =
            Iso8601.toTime >> Result.withDefault (Time.millisToPosix 0)

        lsd =
            LngLat -1.788456535301071 46.470243284275966
    in
    { key = "vg20"
    , name = "Vendée Globe 2020"
    , startTime = parseTime "2020-11-08T11:00:00+01:00" |> Time.posixToMillis
    , start = lsd
    , finish = lsd
    , timeFactor = 100
    }
