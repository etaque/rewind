import * as React from "react";
import { rewind } from "./icons";

import { State } from "./State";

type ControlsProps = { state: State; startRace: () => void };

const Controls: React.FC<ControlsProps> = ({
  state,
  startRace,
}): React.ReactElement => {
  switch (state.type) {
    case "Idle":
      return (
        <div className="fixed inset-0 z-10">
          <div className="  fixed inset-0 flex flex-col space-y-4 items-center justify-center bg-black bg-opacity-10">
            <h1 className="logo">Re:wind</h1>
            <button className="btn-start" onClick={startRace}>
              {rewind}
            </button>
          </div>
        </div>
      );
    case "Playing":
      return <div />;
  }
};

export default Controls;
