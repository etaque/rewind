port module Ports exposing (Input(..), Output(..), encodeOutput, inputDecoder, inputs, outputs, receive, send)

import Json.Decode as JD
import Json.Encode as JE
import Model as M
import Time exposing (Posix)


port outputs : JE.Value -> Cmd msg


send : Output -> Cmd msg
send output =
    encodeOutput output |> outputs


port inputs : (JE.Value -> msg) -> Sub msg


receive : JD.Value -> Result JD.Error Input
receive =
    JD.decodeValue inputDecoder


type Output
    = GetWind Posix M.LngLat
    | StartCourse String


type Input
    = Disconnected
    | SendWind M.WindReport


inputDecoder : JD.Decoder Input
inputDecoder =
    JD.field "tag" JD.string
        |> JD.andThen decodeInput


decodeInput : String -> JD.Decoder Input
decodeInput tag =
    case tag of
        "SendWind" ->
            JD.map SendWind (JD.field "report" M.windReportDecoder)

        "Disconnected" ->
            JD.succeed Disconnected

        _ ->
            JD.fail ("Unknown FromServer tag: " ++ tag)


encodeOutput : Output -> JE.Value
encodeOutput output =
    case output of
        GetWind time position ->
            JE.object
                [ ( "tag", JE.string "GetWind" )
                , ( "time", JE.int (Time.posixToMillis time) )
                , ( "position", M.encodeLngLat position )
                ]

        StartCourse key ->
            JE.object
                [ ( "tag", JE.string "StartCourse" )
                , ( "key", JE.string key )
                ]
