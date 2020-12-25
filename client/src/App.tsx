import * as React from "react";
import useWebSocket from "react-use-websocket";
import useAnimationFrame from "./useAnimationFrame";

import Map from "./Map";
import Controls from "./Controls";
import { initialState, reducer } from "./State";

type AppProps = { tileServerAddress: string; wsAddress: string };

export const App: React.FC<AppProps> = ({
  wsAddress,
}: AppProps): React.ReactElement => {
  const { sendMessage } = useWebSocket(wsAddress + "/session");
  const [state, dispatch] = React.useReducer(reducer, initialState);

  useAnimationFrame((delta) => dispatch({ type: "Tick", delta }));

  const startRace = () => {
    sendMessage("Hey");
    dispatch({ type: "Start" });
  };

  const controlsProps = { state, startRace };

  return (
    <div>
      <Controls {...controlsProps} />
      <Map />
    </div>
  );
};
