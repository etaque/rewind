port module Ports exposing (Input(..), Output(..), UpdateMap(..), decodeInput, decodeInputValue, encodeOutput, inputDecoder, inputs, outputs, send)

import Json.Decode as JD
import Json.Encode as JE
import Model as M


port outputs : JE.Value -> Cmd msg


send : Output -> Cmd msg
send output =
    encodeOutput output |> outputs


port inputs : (JE.Value -> msg) -> Sub msg


decodeInputValue : JD.Value -> Result JD.Error Input
decodeInputValue =
    JD.decodeValue inputDecoder


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


type Output
    = StartSession
    | UpdateMap UpdateMap
    | GetWind { time : Int, position : M.LngLat }


type UpdateMap
    = MoveTo M.LngLat
    | SetWind M.WindReport


encodeOutput : Output -> JE.Value
encodeOutput output =
    case output of
        GetWind { time, position } ->
            tagged "GetWind"
                [ ( "time", JE.int time )
                , ( "position", M.encodeLngLat position )
                ]

        StartSession ->
            tagged "StartSession" []

        UpdateMap updateMap ->
            tagged "UpdateMap" <|
                [ ( "updateMap", encodeUpdateMap updateMap ) ]


encodeUpdateMap : UpdateMap -> JE.Value
encodeUpdateMap updateMap =
    case updateMap of
        MoveTo position ->
            tagged "MoveTo"
                [ ( "position", M.encodeLngLat position )
                ]

        SetWind report ->
            tagged "SetWind"
                [ ( "report", M.encodeWindReport report )
                ]


tagged : String -> List ( String, JE.Value ) -> JE.Value
tagged tag fields =
    JE.object <| ( "tag", JE.string tag ) :: fields
