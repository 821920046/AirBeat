"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function useClock() {
  const tick = () => {
    const d = new Date();
    const h = d.getHours();
    const m = d.getMinutes();
    const s = d.getSeconds();

    const time = `${pad(h)}:${pad(m)}`;
    const seconds = pad(s);

    const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long" });
    const dateFmt = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return {
      time,
      seconds,
      day: dayFmt.format(d),
      date: dateFmt.format(d),
    };
  };

  const [state, setState] = useState(tick);

  useEffect(() => {
    const id = setInterval(() => setState(tick()), 1000);
    return () => clearInterval(id);
  }, []);

  return state;
}
