import type { ApproachLayout, Direction, Layout } from "../types";

export type Vec2 = [number, number];

/** Направление движения машин, въезжающих с соответствующей стороны. */
export const HEADING: Record<Direction, Vec2> = {
  N: [0, -1],
  S: [0, 1],
  E: [-1, 0],
  W: [1, 0],
};

export function rightOf([x, z]: Vec2): Vec2 {
  return [z, -x];
}

export interface ApproachFrame extends ApproachLayout {
  h: Vec2;
  r: Vec2;
}

export function approachFrames(layout: Layout): ApproachFrame[] {
  return layout.approaches.map((a) => {
    const h = HEADING[a.direction];
    return { ...a, h, r: rightOf(h) };
  });
}

/**
 * Точка в мировых координатах: travel — расстояние от центра перекрёстка
 * в сторону въезда, lateral — сдвиг вправо по ходу движения.
 */
export function point(frame: ApproachFrame, travel: number, lateral: number): Vec2 {
  return [-frame.h[0] * travel + frame.r[0] * lateral, -frame.h[1] * travel + frame.r[1] * lateral];
}

/** Ось, вдоль которой едут машины этого въезда. */
export function travelAxis(frame: ApproachFrame): "x" | "z" {
  return Math.abs(frame.h[0]) > 0.5 ? "x" : "z";
}
