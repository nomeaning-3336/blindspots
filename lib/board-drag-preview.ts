type Point = {
  x: number;
  y: number;
};

export function dragPreviewPosition({
  pointer,
}: {
  pointer: Point;
  originPointer: Point;
  originCenter: Point;
}): Point {
  return pointer;
}
