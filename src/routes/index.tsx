"use client";

import { createFileRoute } from "@tanstack/react-router";
import { GameCanvas } from "@/game/game-canvas";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GameCanvas />;
}
