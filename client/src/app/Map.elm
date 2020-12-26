port module Map exposing (Request(..), Response(..), decodeResponse, decodeResponseValue, encodeRequest, requests, responseDecoder, responses, send)

import Json.Decode as JD
import Json.Encode as JE
import Model exposing (..)


port requests : JE.Value -> Cmd msg


send : Request -> Cmd msg
send request =
    encodeRequest request |> requests


port responses : (JE.Value -> msg) -> Sub msg


decodeResponseValue : JD.Value -> Result JD.Error Response
decodeResponseValue =
    JD.decodeValue responseDecoder


type Response
    = WindIs WindForce


responseDecoder : JD.Decoder Response
responseDecoder =
    JD.field "tag" JD.string
        |> JD.andThen decodeResponse


decodeResponse : String -> JD.Decoder Response
decodeResponse tag =
    case tag of
        "WindIs" ->
            JD.map WindIs (JD.field "windForce" windForceDecoder)

        _ ->
            JD.fail ("Unknown Input tag: " ++ tag)


type Request
    = ShowMap Course
    | MoveTo LngLat
    | LoadReport WindReport
    | GetWindAt { time : Int, position : LngLat }


encodeRequest : Request -> JE.Value
encodeRequest output =
    case output of
        ShowMap course ->
            tagged "ShowMap"
                [ ( "course", encodeCourse course ) ]

        GetWindAt { time, position } ->
            tagged "GetWindAt"
                [ ( "time", JE.int time )
                , ( "position", encodeLngLat position )
                ]

        MoveTo position ->
            tagged "MoveTo"
                [ ( "position", encodeLngLat position )
                ]

        LoadReport report ->
            tagged "LoadReport"
                [ ( "windReport", encodeWindReport report )
                ]


tagged : String -> List ( String, JE.Value ) -> JE.Value
tagged tag fields =
    JE.object <| ( "tag", JE.string tag ) :: fields
