import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GameScreen } from "@/components/game-screen";
import {
  CreateScreen,
  HubScreen,
  SelectScreen,
  TitleScreen,
} from "@/components/player-screens";
import type { PlayerRecord } from "@/game/types";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Home,
});


type Screen = "title" | "select" | "create" | "hub" | "play";

function Home() {
  const [screen, setScreen] = useState<Screen>("title");
  const [player, setPlayer] = useState<PlayerRecord | null>(null);

  const enter = useCallback(() => setScreen("select"), []);

  if (screen === "title") return <TitleScreen onEnter={enter} />;
  if (screen === "select")
    return (
      <SelectScreen
        onCreate={() => setScreen("create")}
        onPlay={(p) => {
          setPlayer(p);
          setScreen("hub");
        }}
      />
    );
  if (screen === "create")
    return (
      <CreateScreen
        onBack={() => setScreen("select")}
        onCreated={(p) => {
          setPlayer(p);
          setScreen("select");
        }}
      />
    );
  if (screen === "hub" && player)
    return (
      <HubScreen
        player={player}
        onPlay={() => setScreen("play")}
        onBack={() => {
          setPlayer(null);
          setScreen("select");
        }}
      />
    );
  if (screen === "play" && player)
    return (
      <GameScreen
        player={player}
        onQuit={() => setScreen("hub")}
      />
    );
  return <SelectScreen onCreate={() => setScreen("create")} onPlay={(p) => { setPlayer(p); setScreen("hub"); }} />;
}
