module App exposing (..)

import Browser
import Browser.Navigation as Nav
import Html as H
import Html.Attributes as HA
import Return exposing (Return)
import Url exposing (Url)


main : Program Flags Model Msg
main =
    Browser.application
        { init = init
        , onUrlChange = UrlChange
        , onUrlRequest = UrlRequest
        , update = update
        , view = view
        , subscriptions = subscriptions
        }


type alias Model =
    {}


type alias Flags =
    {}


type Msg
    = UrlChange Url
    | UrlRequest Browser.UrlRequest


init : Flags -> Url -> Nav.Key -> Return Msg Model
init flags url navigationKey =
    Return.singleton {}


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.none


update : Msg -> Model -> Return Msg Model
update msg model =
    case msg of
        _ ->
            Return.singleton model


view : Model -> Browser.Document Msg
view model =
    let
        body =
            H.div
                [ HA.class "container" ]
                [ H.h1
                    [ HA.class "font-sans text-5xl" ]
                    [ H.text "Hey there!" ]
                ]
    in
    { title = "Re:WIND", body = [ body ] }
