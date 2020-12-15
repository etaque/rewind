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
    = StartSession
    | MoveTo M.LngLat
    | GetWind Posix M.LngLat


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


tagged : String -> List ( String, JE.Value ) -> JE.Value
tagged tag fields =
    JE.object <| ( "tag", JE.string tag ) :: fields


encodeOutput : Output -> JE.Value
encodeOutput output =
    case output of
        GetWind time position ->
            tagged "GetWind"
                [ ( "time", JE.int (Time.posixToMillis time) )
                , ( "position", M.encodeLngLat position )
                ]

        StartSession ->
            tagged "StartSession" []

        MoveTo position ->
            tagged "MoveTo"
                [ ( "position", M.encodeLngLat position ) ]
