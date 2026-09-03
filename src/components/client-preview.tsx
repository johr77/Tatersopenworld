import { useEffect, useState } from "react";
import type { ComponentType } from "react";

export function ClientPreview({ charId }: { charId: string }) {
  const [Comp, setComp] = useState<ComponentType<{ charId: string }> | null>(null);
  useEffect(() => {
    let live = true;
    void import("./character-preview").then((m) => {
      if (live) setComp(() => m.CharacterPreview);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!Comp) return <div className="h-full w-full bg-surface" />;
  return <Comp charId={charId} />;
}
