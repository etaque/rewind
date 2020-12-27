module Main exposing (main)

import Browser
import Browser.Events
import Html as H exposing (Html)
import Html.Attributes as HA
import Html.Events as HE
import Http
import Json.Decode as JD
import Json.Encode as JE
import Map
import Model exposing (..)
import Svg as S
import Svg.Attributes as SA


type alias Flags =
    { serverUrl : String }


main : Program Flags Model Msg
main =
    Browser.element
        { init = init
        , update = update
        , view = view
        , subscriptions =
            \model ->
                Sub.batch
                    [ Map.responses MapResponse
                    , case model.state of
                        Playing _ ->
                            Browser.Events.onAnimationFrameDelta Tick

                        _ ->
                            Sub.none
                    ]
        }


type alias Model =
    { state : State
    , flags : Flags
    }


type State
    = Idle
    | Loading Course
    | Playing Session


type alias Session =
    { clock : Float
    , lastWindRefresh : Float
    , courseTime : Int
    , position : LngLat
    , course : Course
    , reports : List WindReport
    , windSpeed : WindSpeed
    }


init : Flags -> ( Model, Cmd Msg )
init flags =
    ( Model Idle flags, Cmd.none )


type Msg
    = LoadCourse Course
    | ReportsResponse (Result Http.Error (List WindReport))
    | MapResponse JE.Value
    | Tick Float


windRefreshInterval : Float
windRefreshInterval =
    1000


update : Msg -> Model -> ( Model, Cmd Msg )
update message model =
    case ( message, model.state ) of
        ( LoadCourse course, Idle ) ->
            ( { model | state = Loading course }
            , Cmd.batch
                [ Map.send (Map.ShowMap course)
                , getReports model.flags.serverUrl course.startTime
                ]
            )

        ( ReportsResponse result, Loading course ) ->
            case result of
                Ok (report :: nextReports) ->
                    let
                        session =
                            { clock = 0
                            , lastWindRefresh = 0
                            , courseTime = course.startTime
                            , position = course.start
                            , course = course
                            , reports = report :: nextReports
                            , windSpeed = { u = 0, v = 0 }
                            }
                    in
                    ( { model | state = Playing session }
                    , Map.send (Map.LoadReport report)
                    )

                _ ->
                    ( { model | state = Idle }, Cmd.none )

        ( MapResponse value, _ ) ->
            case ( Map.decodeResponseValue value, model.state ) of
                ( Ok (Map.WindIs windSpeed), Playing session ) ->
                    ( { model | state = Playing { session | windSpeed = windSpeed } }
                    , Cmd.none
                    )

                ( Err e, _ ) ->
                    let
                        _ =
                            Debug.log (JD.errorToString e) (JE.encode 0 value)
                    in
                    ( model, Cmd.none )

                _ ->
                    -- unexpected input
                    ( model, Cmd.none )

        ( Tick delta, Playing session ) ->
            let
                newClock =
                    session.clock + delta

                newCourseTime =
                    session.course.startTime + round (newClock * session.course.timeFactor)

                newSession =
                    { session | clock = newClock, courseTime = newCourseTime }
            in
            if newClock - session.lastWindRefresh > windRefreshInterval then
                ( { model | state = Playing { newSession | lastWindRefresh = newClock } }
                , Map.send (Map.GetWindAt { time = newSession.courseTime, position = newSession.position })
                )

            else
                ( { model | state = Playing newSession }, Cmd.none )

        _ ->
            ( model, Cmd.none )


getReports : String -> Int -> Cmd Msg
getReports serverUrl since =
    Http.get
        { url = serverUrl ++ "/wind-reports/since/" ++ String.fromInt since
        , expect = Http.expectJson ReportsResponse windReportsDecoder
        }


view : Model -> Html Msg
view model =
    case model.state of
        Idle ->
            H.div
                [ HA.class "fixed inset-0 flex flex-col space-y-4 items-center justify-center bg-black bg-opacity-10" ]
                [ H.h1 [ HA.class "logo" ] [ H.text "Re:wind" ]
                , H.button
                    [ HA.class "btn-start"
                    , HE.onClick (LoadCourse vg20)
                    ]
                    [ rewindIcon ]
                ]

        Loading _ ->
            H.text ""

        Playing _ ->
            H.text ""


rewindIcon : Html msg
rewindIcon =
    icon "M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z"


icon : String -> Html msg
icon d =
    S.svg
        [ SA.viewBox "0 0 20 20"
        , SA.fill "currentColor"
        ]
        [ S.path [ SA.d d ] []
        ]
