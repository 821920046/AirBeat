"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

// 服务端和客户端初始值保持一致，避免 hydration mismatch
const INITIAL_STATE = { time: "00:00", seconds: "00", day: "---", date: "---" };

function tick() {
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
}

export function useClock() {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    const update = () => setState(tick());
    const frame = requestAnimationFrame(update);
    const id = setInterval(update, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(id);
    };
  }, []);

  return state;
}
